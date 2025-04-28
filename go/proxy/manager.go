package proxy

import (
	"bufio"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// ProxyManager quản lý danh sách proxy
type ProxyManager struct {
	proxies       []*Proxy
	maxRetries    int
	failThreshold int
	mu            sync.RWMutex
	used          map[string]time.Time
	testURL       string
	checkInterval time.Duration
	rand          *rand.Rand
}

func NewProxyManager() *ProxyManager {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return &ProxyManager{
		proxies:       make([]*Proxy, 0),
		maxRetries:    3,
		failThreshold: 5,
		used:          make(map[string]time.Time),
		testURL:       "http://ip4.me/api",
		checkInterval: 5 * time.Minute,
		rand:          r,
	}
}

func (pm *ProxyManager) AddProxy(proxy *Proxy) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// Kiểm tra xem proxy đã tồn tại chưa
	for _, p := range pm.proxies {
		if p.URL == proxy.URL {
			return
		}
	}

	pm.proxies = append(pm.proxies, proxy)
}

func (pm *ProxyManager) GetRandomProxy() *Proxy {
	// Lấy proxy mới từ API
	proxy, err := GetProxyForRequest(ProxyTypeHTTP)
	if err != nil {
		return nil
	}
	return proxy
}

func (pm *ProxyManager) MarkProxySuccess(proxy *Proxy) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for _, p := range pm.proxies {
		if p.URL == proxy.URL {
			p.FailCount = 0
			p.IsWorking = true
			return
		}
	}
}

func (pm *ProxyManager) MarkProxyFailure(proxy *Proxy) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for _, p := range pm.proxies {
		if p.URL == proxy.URL {
			p.FailCount++
			p.IsWorking = false
			return
		}
	}
}

// SetTestURL changes the URL used for testing proxies
func (pm *ProxyManager) SetTestURL(url string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.testURL = url
}

// SetMaxRetries sets the maximum number of retries with different proxies
func (pm *ProxyManager) SetMaxRetries(retries int) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.maxRetries = retries
}

// SetMaxFails sets the maximum allowed consecutive failures
func (pm *ProxyManager) SetMaxFails(fails int) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.failThreshold = fails
}

// SetCheckInterval sets the interval for health checks
func (pm *ProxyManager) SetCheckInterval(duration time.Duration) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.checkInterval = duration
}

func (pm *ProxyManager) LoadProxies(filename string) error {
	file, err := os.Open(filename)
	if err != nil {
		return fmt.Errorf("failed to open proxy list file: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		proxy, err := parseProxy(line)
		if err != nil {
			continue
		}
		proxy.IsWorking = true // Assume working by default
		pm.proxies = append(pm.proxies, proxy)
	}

	if len(pm.proxies) == 0 {
		return fmt.Errorf("no valid proxies found in file")
	}

	// Start background health checking
	go pm.startHealthChecks()

	return nil
}

// startHealthChecks runs periodic health checks on all proxies
func (pm *ProxyManager) startHealthChecks() {
	ticker := time.NewTicker(pm.checkInterval)
	defer ticker.Stop()

	for {
		<-ticker.C
		pm.checkAllProxies()
	}
}

// checkAllProxies tests all proxies in the pool
func (pm *ProxyManager) checkAllProxies() {
	pm.mu.Lock()
	proxies := make([]*Proxy, len(pm.proxies))
	copy(proxies, pm.proxies)
	pm.mu.Unlock()

	for _, proxy := range proxies {
		isWorking := pm.testProxy(proxy)

		pm.mu.Lock()
		proxy.LastChecked = time.Now()
		proxy.IsWorking = isWorking
		if !isWorking {
			proxy.FailCount++
		} else {
			proxy.FailCount = 0 // Reset fail count on success
		}
		pm.mu.Unlock()
	}

	// Remove proxies with too many failures
	pm.cleanupFailedProxies()
}

// testProxy checks if a proxy is working by making a test request
func (pm *ProxyManager) testProxy(proxy *Proxy) bool {
	var proxyURL *url.URL
	var err error

	// Parse proxy URL based on format
	if strings.Contains(proxy.URL, "http://") {
		// URL already has scheme
		proxyURL, err = url.Parse(proxy.URL)
	} else {
		// Add scheme
		proxyURL, err = url.Parse("http://" + proxy.URL)
	}

	if err != nil {
		return false
	}

	// Set proxy authentication if needed
	if proxy.Username != "" && proxy.Password != "" {
		proxyURL.User = url.UserPassword(proxy.Username, proxy.Password)
	}

	// Create HTTP client with proxy
	client := &http.Client{
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
		},
		Timeout: 10 * time.Second,
	}

	// Try to fetch the test URL
	resp, err := client.Get(pm.testURL)
	if err != nil {
		logger.Info("Proxy test failed for %s: %v", proxy.URL, err)
		return false
	}
	defer resp.Body.Close()

	// Check if status code is successful
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logger.Info("Proxy test failed for %s: status code %d", proxy.URL, resp.StatusCode)
		return false
	}

	logger.Info("Proxy test successful for %s", proxy.URL)
	return true
}

// cleanupFailedProxies removes proxies with too many failures
func (pm *ProxyManager) cleanupFailedProxies() {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	var workingProxies []*Proxy
	for _, proxy := range pm.proxies {
		if proxy.FailCount < pm.failThreshold {
			workingProxies = append(workingProxies, proxy)
		} else {
			logger.Info("Removing failed proxy: %s (failed %d times)", proxy.URL, proxy.FailCount)
		}
	}

	pm.proxies = workingProxies
}

// MarkProxyFailed marks a proxy as failed and increments its failure count
func (pm *ProxyManager) MarkProxyFailed(failedProxy *Proxy) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for _, proxy := range pm.proxies {
		if proxy.URL == failedProxy.URL {
			proxy.IsWorking = false
			proxy.FailCount++
			logger.Info("Marked proxy as failed: %s (fail count: %d)", proxy.URL, proxy.FailCount)
			break
		}
	}
}

// GetNextWorkingProxy returns the next working proxy
func (pm *ProxyManager) GetNextWorkingProxy(excludeURL string) *Proxy {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if len(pm.proxies) == 0 {
		return nil
	}

	// Find proxy that is working, hasn't been used or used longest time ago
	var selectedProxy *Proxy
	var oldestUsedTime time.Time
	first := true

	for _, proxy := range pm.proxies {
		// Skip the excluded proxy and non-working proxies
		if proxy.URL == excludeURL || !proxy.IsWorking {
			continue
		}

		lastUsed, exists := pm.used[proxy.URL]
		if !exists {
			// If proxy hasn't been used, select it immediately
			selectedProxy = proxy
			break
		}

		if first || lastUsed.Before(oldestUsedTime) {
			oldestUsedTime = lastUsed
			selectedProxy = proxy
			first = false
		}
	}

	// Update last used time
	if selectedProxy != nil {
		pm.used[selectedProxy.URL] = time.Now()
	}

	return selectedProxy
}

func parseProxy(line string) (*Proxy, error) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, fmt.Errorf("empty line")
	}

	// Format: user:pass@ip:port
	if strings.Contains(line, "@") {
		parts := strings.Split(line, "@")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid proxy format")
		}

		auth := strings.Split(parts[0], ":")
		if len(auth) != 2 {
			return nil, fmt.Errorf("invalid auth format")
		}

		return &Proxy{
			URL:      fmt.Sprintf("http://%s", parts[1]),
			Username: auth[0],
			Password: auth[1],
			LastUsed: time.Time{},
		}, nil
	}

	// Format: ip:port:user:pass
	parts := strings.Split(line, ":")
	if len(parts) == 4 {
		return &Proxy{
			URL:      fmt.Sprintf("http://%s:%s", parts[0], parts[1]),
			Username: parts[2],
			Password: parts[3],
			LastUsed: time.Time{},
		}, nil
	}

	// Format: ip:port
	if len(parts) == 2 {
		return &Proxy{
			URL:      fmt.Sprintf("http://%s:%s", parts[0], parts[1]),
			Username: "",
			Password: "",
			LastUsed: time.Time{},
		}, nil
	}

	// Format: ip
	if len(parts) == 1 {
		return &Proxy{
			URL:      fmt.Sprintf("http://%s", parts[0]),
			Username: "",
			Password: "",
			LastUsed: time.Time{},
		}, nil
	}

	return nil, fmt.Errorf("invalid proxy format")
}

func splitProxyLine(line string) []string {
	var parts []string
	var current string
	var inQuotes bool

	for _, char := range line {
		switch char {
		case ':':
			if !inQuotes {
				parts = append(parts, current)
				current = ""
			} else {
				current += string(char)
			}
		case '"':
			inQuotes = !inQuotes
		default:
			current += string(char)
		}
	}

	if current != "" {
		parts = append(parts, current)
	}

	return parts
}

// GetRandomProxyWithFilter trả về một proxy ngẫu nhiên phù hợp với bộ lọc
func (pm *ProxyManager) GetRandomProxyWithFilter(selector ProxySelector) *Proxy {
	// Lấy proxy mới từ API
	proxy, err := GetProxyForRequest(ProxyTypeHTTP)
	if err != nil {
		return nil
	}

	// Kiểm tra xem proxy có phù hợp với bộ lọc không
	if selector(proxy) {
		return proxy
	}

	return nil
}

// GetNextWorkingProxyWithFilter trả về proxy tiếp theo phù hợp với bộ lọc
func (pm *ProxyManager) GetNextWorkingProxyWithFilter(excludeURL string, selector ProxySelector) *Proxy {
	// Lấy proxy mới từ API
	proxy, err := GetProxyForRequest(ProxyTypeHTTP)
	if err != nil {
		return nil
	}

	// Kiểm tra xem proxy có phù hợp với bộ lọc không
	if proxy.URL != excludeURL && selector(proxy) {
		return proxy
	}

	return nil
}

func (pm *ProxyManager) GetProxyCount() int {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return len(pm.proxies)
}

// ProxySelector định nghĩa hàm lọc proxy theo tiêu chí
type ProxySelector func(*Proxy) bool
