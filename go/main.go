package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"proxy/proxy"
)

const (
	serverPort = ":8081"
)

func main() {
	log.Println("[INFO] Khởi động proxy server")

	pm := proxy.NewProxyManager()

	// Hàm để cập nhật proxy từ API
	updateProxies := func() {
		proxies, err := proxy.FetchProxyFromAPI()
		if err != nil {
			log.Printf("[ERROR] Failed to fetch proxy from API: %v", err)
			return
		}

		for _, p := range proxies {
			pm.AddProxy(p)
			log.Printf("[INFO] Added proxy: %s (Type: %v)", p.URL, p.Type)
		}
	}

	// Cập nhật proxy ban đầu
	updateProxies()

	// Cập nhật proxy định kỳ mỗi 5 phút
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			updateProxies()
		}
	}()

	// Khởi động proxy server
	go func() {
		if err := proxy.StartProxyServer(pm, serverPort); err != nil {
			log.Fatalf("[ERROR] Failed to start proxy server: %v", err)
		}
	}()

	// Xử lý tắt graceful
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("[INFO] Shutting down server...")
}
