package proxy

import "time"

// ProxyType định nghĩa loại proxy
type ProxyType string

const (
	// ProxyTypeHTTP là loại proxy HTTP
	ProxyTypeHTTP ProxyType = "http"
	// ProxyTypeSOCKS5 là loại proxy SOCKS5
	ProxyTypeSOCKS5 ProxyType = "socks5"
	// ProxyTypeUnknown là loại proxy chưa xác định
	ProxyTypeUnknown ProxyType = "unknown"
)

// Proxy đại diện cho một proxy server
type Proxy struct {
	URL         string
	Username    string
	Password    string
	AuthHeader  string
	LastUsed    time.Time
	FailCount   int
	LastChecked time.Time
	IsWorking   bool
	Type        ProxyType
}
