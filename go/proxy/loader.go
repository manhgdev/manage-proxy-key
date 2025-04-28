package proxy

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// LoadProxiesFromMultipleFiles tải proxy từ nhiều file
func LoadProxiesFromMultipleFiles(httpFile, socks5File string, pm *ProxyManager) error {
	if err := LoadProxiesWithType(httpFile, ProxyTypeHTTP, pm); err != nil {
		return fmt.Errorf("failed to load HTTP proxies: %v", err)
	}

	if err := LoadProxiesWithType(socks5File, ProxyTypeSOCKS5, pm); err != nil {
		return fmt.Errorf("failed to load SOCKS5 proxies: %v", err)
	}

	// Kiểm tra xem có proxy nào được tải không
	if pm.GetProxyCount() == 0 {
		return fmt.Errorf("no valid proxies found in any file")
	}

	return nil
}

// LoadProxies tải proxy từ một file duy nhất (cho tương thích ngược)
func LoadProxies(filename string, pm *ProxyManager) error {
	return LoadProxiesWithType(filename, ProxyTypeHTTP, pm)
}

// LoadProxiesWithType tải proxy từ file với type xác định
func LoadProxiesWithType(filename string, proxyType ProxyType, pm *ProxyManager) error {
	file, err := os.Open(filename)
	if err != nil {
		return fmt.Errorf("failed to open proxy list file: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {
			continue
		}

		proxy := &Proxy{
			URL:  line,
			Type: proxyType,
		}
		pm.AddProxy(proxy)
	}

	return nil
}

// MonitorProxyList giám sát các file proxy để cập nhật
func MonitorProxyList(httpFile, socks5File string, pm *ProxyManager) {
	var lastModHTTP, lastModSOCKS5 time.Time

	// Lấy thời gian sửa đổi ban đầu
	if httpFile != "" {
		if stat, err := os.Stat(httpFile); err == nil {
			lastModHTTP = stat.ModTime()
		}
	}

	if socks5File != "" {
		if stat, err := os.Stat(socks5File); err == nil {
			lastModSOCKS5 = stat.ModTime()
		}
	}

	for {
		time.Sleep(5 * time.Second)

		// Kiểm tra file HTTP proxy
		if httpFile != "" {
			if stat, err := os.Stat(httpFile); err == nil {
				if stat.ModTime() != lastModHTTP {
					log.Printf("[INFO] HTTP proxy file %s changed, reloading", httpFile)
					if err := LoadProxiesWithType(httpFile, ProxyTypeHTTP, pm); err != nil {
						log.Printf("[ERROR] Error reloading HTTP proxies: %v", err)
					}
					lastModHTTP = stat.ModTime()
				}
			}
		}

		// Kiểm tra file SOCKS5 proxy
		if socks5File != "" {
			if stat, err := os.Stat(socks5File); err == nil {
				if stat.ModTime() != lastModSOCKS5 {
					log.Printf("[INFO] SOCKS5 proxy file %s changed, reloading", socks5File)
					if err := LoadProxiesWithType(socks5File, ProxyTypeSOCKS5, pm); err != nil {
						log.Printf("[ERROR] Error reloading SOCKS5 proxies: %v", err)
					}
					lastModSOCKS5 = stat.ModTime()
				}
			}
		}
	}
}
