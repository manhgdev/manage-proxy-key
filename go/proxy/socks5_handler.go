package proxy

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
	"time"
)

// Các hằng số SOCKS5
const (
	SOCKS5_VERSION          = 0x05
	SOCKS5_CMD_CONNECT      = 0x01
	SOCKS5_ADDR_TYPE_IPV4   = 0x01
	SOCKS5_ADDR_TYPE_DOMAIN = 0x03
	SOCKS5_ADDR_TYPE_IPV6   = 0x04
)

// SOCKS5Config cấu hình cho SOCKS5 proxy
type SOCKS5Config struct {
	SkipVerify bool
}

// SOCKS5DefaultConfig trả về cấu hình mặc định
func SOCKS5DefaultConfig() *SOCKS5Config {
	return &SOCKS5Config{
		SkipVerify: true,
	}
}

var socks5Config = SOCKS5DefaultConfig()

// Cấu hình SOCKS5
func ConfigureSOCKS5(config *SOCKS5Config) {
	if config != nil {
		socks5Config = config
	}
}

// Xử lý request SOCKS5
func handleSOCKS5(clientConn net.Conn, pm *ProxyManager) {
	logger.Info("Handling SOCKS5 proxy request")
	defer clientConn.Close()

	// Đọc phiên bản SOCKS và số phương thức xác thực
	header := make([]byte, 2)
	if _, err := io.ReadFull(clientConn, header); err != nil {
		logger.Error("Failed to read SOCKS5 header: %v", err)
		return
	}

	if header[0] != SOCKS5_VERSION {
		logger.Error("Unsupported SOCKS version: %d", header[0])
		clientConn.Write([]byte{SOCKS5_VERSION, 0xFF})
		return
	}

	// Đọc danh sách phương thức xác thực được hỗ trợ
	methodCount := int(header[1])
	methods := make([]byte, methodCount)
	if _, err := io.ReadFull(clientConn, methods); err != nil {
		logger.Error("Failed to read authentication methods: %v", err)
		return
	}

	// Hiện tại chúng ta chỉ hỗ trợ phương thức không xác thực (0)
	clientConn.Write([]byte{SOCKS5_VERSION, 0x00})

	// Đọc request
	header = make([]byte, 4)
	if _, err := io.ReadFull(clientConn, header); err != nil {
		logger.Error("Failed to read SOCKS5 request: %v", err)
		return
	}

	if header[0] != SOCKS5_VERSION {
		logger.Error("Unsupported SOCKS version in request: %d", header[0])
		return
	}

	if header[1] != SOCKS5_CMD_CONNECT {
		logger.Error("Unsupported SOCKS5 command: %d", header[1])
		clientConn.Write([]byte{SOCKS5_VERSION, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
		return
	}

	// Đọc địa chỉ
	var targetHost string
	var targetPort uint16

	addrType := header[3]
	switch addrType {
	case SOCKS5_ADDR_TYPE_IPV4:
		addr := make([]byte, 4)
		if _, err := io.ReadFull(clientConn, addr); err != nil {
			logger.Error("Failed to read IPv4 address: %v", err)
			sendSocks5Error(clientConn, 0x01)
			return
		}
		targetHost = net.IP(addr).String()

	case SOCKS5_ADDR_TYPE_DOMAIN:
		lenByte := make([]byte, 1)
		if _, err := io.ReadFull(clientConn, lenByte); err != nil {
			logger.Error("Failed to read domain length: %v", err)
			sendSocks5Error(clientConn, 0x01)
			return
		}

		domainLength := int(lenByte[0])
		if domainLength > 255 {
			logger.Error("Domain length too long: %d", domainLength)
			sendSocks5Error(clientConn, 0x01)
			return
		}

		domain := make([]byte, domainLength)
		if _, err := io.ReadFull(clientConn, domain); err != nil {
			logger.Error("Failed to read domain: %v", err)
			sendSocks5Error(clientConn, 0x01)
			return
		}
		targetHost = string(domain)

	case SOCKS5_ADDR_TYPE_IPV6:
		addr := make([]byte, 16)
		if _, err := io.ReadFull(clientConn, addr); err != nil {
			logger.Error("Failed to read IPv6 address: %v", err)
			sendSocks5Error(clientConn, 0x01)
			return
		}
		targetHost = net.IP(addr).String()

	default:
		logger.Error("Unsupported address type: %d", addrType)
		sendSocks5Error(clientConn, 0x08)
		return
	}

	// Đọc port
	portBytes := make([]byte, 2)
	if _, err := io.ReadFull(clientConn, portBytes); err != nil {
		logger.Error("Failed to read port: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}
	targetPort = binary.BigEndian.Uint16(portBytes)

	targetAddr := fmt.Sprintf("%s:%d", targetHost, targetPort)
	logger.Info("SOCKS5 target: %s", targetAddr)

	// Lấy proxy SOCKS5 mới từ API
	proxy, err := GetProxyForRequest(ProxyTypeSOCKS5)
	if err != nil {
		logger.Error("Failed to get SOCKS5 proxy: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}

	// Mở kết nối tới proxy SOCKS5
	logger.Info("Using SOCKS5 proxy: %s", proxy.URL)

	proxyURL, err := url.Parse(proxy.URL)
	if err != nil {
		logger.Error("Failed to parse proxy URL: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}

	proxyHost := proxyURL.Host
	if proxyHost == "" {
		proxyHost = proxy.URL
	}

	// Lấy IP của proxy
	proxyIP := strings.Split(proxyHost, ":")[0]
	proxyPort := strings.Split(proxyHost, ":")[1]

	logger.Info("Connecting to SOCKS5 proxy at %s", proxyHost)

	proxyConn, err := net.DialTimeout("tcp", proxyHost, 10*time.Second)
	if err != nil {
		logger.Error("Failed to connect to SOCKS5 proxy: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}
	defer proxyConn.Close()

	// Thực hiện bắt tay SOCKS5 với proxy
	var authMethods []byte
	if proxy.Username != "" && proxy.Password != "" {
		authMethods = []byte{0x00, 0x02}
	} else {
		authMethods = []byte{0x00}
	}

	auth := []byte{SOCKS5_VERSION, byte(len(authMethods))}
	auth = append(auth, authMethods...)
	if _, err := proxyConn.Write(auth); err != nil {
		logger.Error("Failed to send auth methods to proxy: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}

	authResp := make([]byte, 2)
	if _, err := io.ReadFull(proxyConn, authResp); err != nil {
		logger.Error("Failed to read auth response from proxy: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}

	if authResp[0] != SOCKS5_VERSION {
		logger.Error("Invalid SOCKS version in auth response: %v", authResp)
		sendSocks5Error(clientConn, 0x01)
		return
	}

	if authResp[1] == 0x02 && proxy.Username != "" && proxy.Password != "" {
		logger.Info("Proxy requires username/password authentication")

		authReq := []byte{0x01}
		authReq = append(authReq, byte(len(proxy.Username)))
		authReq = append(authReq, []byte(proxy.Username)...)
		authReq = append(authReq, byte(len(proxy.Password)))
		authReq = append(authReq, []byte(proxy.Password)...)

		if _, err := proxyConn.Write(authReq); err != nil {
			logger.Error("Failed to send authentication to proxy: %v", err)
			sendSocks5Error(clientConn, 0x01)
			return
		}

		authStatusResp := make([]byte, 2)
		if _, err := io.ReadFull(proxyConn, authStatusResp); err != nil {
			logger.Error("Failed to read auth status from proxy: %v", err)
			sendSocks5Error(clientConn, 0x01)
			return
		}

		if authStatusResp[0] != 0x01 || authStatusResp[1] != 0x00 {
			logger.Error("Authentication failed: %v", authStatusResp)
			sendSocks5Error(clientConn, 0x01)
			return
		}

		logger.Info("Authentication successful")
	} else if authResp[1] != 0x00 {
		logger.Error("Proxy did not accept authentication method: %v", authResp[1])
		sendSocks5Error(clientConn, 0x01)
		return
	}

	// Gửi request kết nối
	request := make([]byte, 0, 10+len(targetHost))
	request = append(request, SOCKS5_VERSION, SOCKS5_CMD_CONNECT, 0x00)

	switch addrType {
	case SOCKS5_ADDR_TYPE_IPV4:
		request = append(request, SOCKS5_ADDR_TYPE_IPV4)
		ip := net.ParseIP(targetHost).To4()
		request = append(request, ip...)

	case SOCKS5_ADDR_TYPE_DOMAIN:
		request = append(request, SOCKS5_ADDR_TYPE_DOMAIN)
		request = append(request, byte(len(targetHost)))
		request = append(request, []byte(targetHost)...)

	case SOCKS5_ADDR_TYPE_IPV6:
		request = append(request, SOCKS5_ADDR_TYPE_IPV6)
		ip := net.ParseIP(targetHost).To16()
		request = append(request, ip...)
	}

	request = append(request, byte(targetPort>>8), byte(targetPort))

	if _, err := proxyConn.Write(request); err != nil {
		logger.Error("Failed to send connection request to proxy: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}

	reply := make([]byte, 4)
	if _, err := io.ReadFull(proxyConn, reply); err != nil {
		logger.Error("Failed to read connection response from proxy: %v", err)
		sendSocks5Error(clientConn, 0x01)
		return
	}

	if reply[0] != SOCKS5_VERSION {
		logger.Error("Invalid SOCKS version in response: %d", reply[0])
		sendSocks5Error(clientConn, 0x01)
		return
	}

	if reply[1] != 0x00 {
		logger.Error("Proxy connection failed: %d", reply[1])
		sendSocks5Error(clientConn, reply[1])
		return
	}

	switch reply[3] {
	case SOCKS5_ADDR_TYPE_IPV4:
		skipBytes := make([]byte, 4+2)
		io.ReadFull(proxyConn, skipBytes)

	case SOCKS5_ADDR_TYPE_DOMAIN:
		lenByte := make([]byte, 1)
		io.ReadFull(proxyConn, lenByte)
		skipBytes := make([]byte, int(lenByte[0])+2)
		io.ReadFull(proxyConn, skipBytes)

	case SOCKS5_ADDR_TYPE_IPV6:
		skipBytes := make([]byte, 16+2)
		io.ReadFull(proxyConn, skipBytes)
	}

	// Trả về IP của proxy thay vì IP local
	successReply := []byte{
		SOCKS5_VERSION,
		0x00,
		0x00,
		SOCKS5_ADDR_TYPE_IPV4,
	}

	// Thêm IP của proxy vào response
	ip := net.ParseIP(proxyIP).To4()
	successReply = append(successReply, ip...)

	// Thêm port của proxy vào response
	port, _ := fmt.Sscanf(proxyPort, "%d", &targetPort)
	if port == 1 {
		successReply = append(successReply, byte(targetPort>>8), byte(targetPort))
	} else {
		successReply = append(successReply, 0, 0)
	}

	if _, err := clientConn.Write(successReply); err != nil {
		logger.Error("Failed to send success response to client: %v", err)
		return
	}

	logger.Info("SOCKS5 connection established to %s via %s", targetAddr, proxy.URL)

	// Tạo tunnel giữa client và target
	handleTLSOverSOCKS5(clientConn, targetAddr, proxyConn)
}

// handleTLSOverSOCKS5 xử lý kết nối TLS qua SOCKS5
func handleTLSOverSOCKS5(clientConn net.Conn, targetAddr string, proxyConn net.Conn) {
	logger.Info("SOCKS5 tunnel established to %s", targetAddr)

	if socks5Config.SkipVerify {
		logger.Debug("SOCKS5 config: SSL verification skipped")
	}

	errChan := make(chan error, 2)

	go func() {
		_, err := io.Copy(proxyConn, clientConn)
		errChan <- err
	}()

	go func() {
		_, err := io.Copy(clientConn, proxyConn)
		errChan <- err
	}()

	err := <-errChan
	if err != nil && err != io.EOF {
		logger.Error("SOCKS5 tunnel error: %v", err)
	}

	logger.Info("SOCKS5 connection to %s completed", targetAddr)
}

// sendSocks5Error gửi thông báo lỗi SOCKS5 cho client
func sendSocks5Error(conn net.Conn, errorCode byte) {
	errorReply := []byte{
		SOCKS5_VERSION,
		errorCode,
		0x00,
		SOCKS5_ADDR_TYPE_IPV4,
		0, 0, 0, 0,
		0, 0,
	}

	conn.Write(errorReply)
}
