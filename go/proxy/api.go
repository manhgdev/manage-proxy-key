package proxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"proxy/config"
)

type ProxyResponse struct {
	ProxyData struct {
		Status              int    `json:"status"`
		Message             string `json:"message"`
		ProxyHTTP           string `json:"proxyhttp"`
		ProxySOCKS5         string `json:"proxysocks5"`
		Network             string `json:"Nha Mang"`
		Location            string `json:"Vi Tri"`
		TokenExpirationDate string `json:"Token expiration date"`
	} `json:"proxyData"`
	Key string `json:"key"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

var (
	lastAPICall time.Time
	apiMutex    sync.Mutex
	proxyCache  = make(map[ProxyType]*Proxy)
	cacheMutex  sync.Mutex
)

// parseProxyString phân tích chuỗi proxy theo định dạng IP:PORT:USER:PASS
func parseProxyString(proxyStr string) (host, port, username, password string, err error) {
	parts := strings.Split(proxyStr, ":")
	if len(parts) != 4 {
		return "", "", "", "", fmt.Errorf("invalid proxy format: %s, expected IP:PORT:USER:PASS", proxyStr)
	}

	// Kiểm tra IP
	host = parts[0]
	if !isValidIP(host) {
		return "", "", "", "", fmt.Errorf("invalid IP address: %s", host)
	}

	// Kiểm tra PORT
	port = parts[1]
	if !isValidPort(port) {
		return "", "", "", "", fmt.Errorf("invalid port: %s", port)
	}

	// Kiểm tra USERNAME và PASSWORD
	username = parts[2]
	password = parts[3]
	if username == "" || password == "" {
		return "", "", "", "", fmt.Errorf("username or password is empty")
	}

	return host, port, username, password, nil
}

// isValidIP kiểm tra xem chuỗi có phải là IP hợp lệ không
func isValidIP(ip string) bool {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return false
	}

	for _, part := range parts {
		if len(part) == 0 || len(part) > 3 {
			return false
		}
		for _, c := range part {
			if c < '0' || c > '9' {
				return false
			}
		}
		num := 0
		fmt.Sscanf(part, "%d", &num)
		if num < 0 || num > 255 {
			return false
		}
	}

	return true
}

// isValidPort kiểm tra xem chuỗi có phải là port hợp lệ không
func isValidPort(port string) bool {
	num := 0
	_, err := fmt.Sscanf(port, "%d", &num)
	if err != nil {
		return false
	}
	return num > 0 && num < 65536
}

// createProxyURL tạo URL proxy đúng định dạng
func createProxyURL(host, port, username, password string, proxyType ProxyType) string {
	var scheme string
	if proxyType == ProxyTypeHTTP {
		scheme = "http"
	} else {
		scheme = "socks5"
	}

	proxyURL := &url.URL{
		Scheme: scheme,
		Host:   fmt.Sprintf("%s:%s", host, port),
	}

	if username != "" && password != "" {
		proxyURL.User = url.UserPassword(username, password)
	}

	return proxyURL.String()
}

// FetchProxyFromAPI gọi API để lấy proxy mới
func FetchProxyFromAPI() ([]*Proxy, error) {
	apiMutex.Lock()
	defer apiMutex.Unlock()

	// Đợi ít nhất 1 giây giữa các lần gọi API
	timeSinceLastCall := time.Since(lastAPICall)
	if timeSinceLastCall < time.Second {
		time.Sleep(time.Second - timeSinceLastCall)
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(config.AppConfig.ProxyURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch proxy from API: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %v", err)
	}

	// Kiểm tra xem có phải là lỗi không
	var errorResp ErrorResponse
	if err := json.Unmarshal(body, &errorResp); err == nil && errorResp.Error != "" {
		return nil, fmt.Errorf("API error: %s", errorResp.Error)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned non-200 status code: %d", resp.StatusCode)
	}

	var proxyResp ProxyResponse
	if err := json.Unmarshal(body, &proxyResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %v", err)
	}

	proxies := make([]*Proxy, 0)

	// Tạo proxy HTTP
	if proxyResp.ProxyData.ProxyHTTP != "" {
		host, port, username, password, err := parseProxyString(proxyResp.ProxyData.ProxyHTTP)
		if err != nil {
			return nil, fmt.Errorf("invalid HTTP proxy format: %v", err)
		}

		httpProxy := &Proxy{
			URL:         createProxyURL(host, port, username, password, ProxyTypeHTTP),
			Username:    username,
			Password:    password,
			Type:        ProxyTypeHTTP,
			LastUsed:    time.Now(),
			IsWorking:   true,
			LastChecked: time.Now(),
		}
		proxies = append(proxies, httpProxy)

		// Cập nhật cache
		cacheMutex.Lock()
		proxyCache[ProxyTypeHTTP] = httpProxy
		cacheMutex.Unlock()
	}

	// Tạo proxy SOCKS5
	if proxyResp.ProxyData.ProxySOCKS5 != "" {
		host, port, username, password, err := parseProxyString(proxyResp.ProxyData.ProxySOCKS5)
		if err != nil {
			return nil, fmt.Errorf("invalid SOCKS5 proxy format: %v", err)
		}

		socks5Proxy := &Proxy{
			URL:         createProxyURL(host, port, username, password, ProxyTypeSOCKS5),
			Username:    username,
			Password:    password,
			Type:        ProxyTypeSOCKS5,
			LastUsed:    time.Now(),
			IsWorking:   true,
			LastChecked: time.Now(),
		}
		proxies = append(proxies, socks5Proxy)

		// Cập nhật cache
		cacheMutex.Lock()
		proxyCache[ProxyTypeSOCKS5] = socks5Proxy
		cacheMutex.Unlock()
	}

	if len(proxies) == 0 {
		return nil, fmt.Errorf("no valid proxies found in API response")
	}

	lastAPICall = time.Now()
	return proxies, nil
}

// GetProxyForRequest lấy proxy mới cho mỗi request
func GetProxyForRequest(proxyType ProxyType) (*Proxy, error) {
	// Luôn cố gắng lấy proxy mới từ API
	proxies, err := FetchProxyFromAPI()
	if err != nil {
		// Nếu gọi API lỗi, thử lấy từ cache
		cacheMutex.Lock()
		cachedProxy, exists := proxyCache[proxyType]
		cacheMutex.Unlock()

		if exists && time.Since(cachedProxy.LastUsed) < 30*time.Second {
			return cachedProxy, nil
		}
		return nil, fmt.Errorf("failed to get proxy: %v", err)
	}

	// Tìm proxy phù hợp với loại yêu cầu
	for _, proxy := range proxies {
		if proxy.Type == proxyType {
			return proxy, nil
		}
	}

	return nil, fmt.Errorf("no suitable proxy found for type %s", proxyType)
}
