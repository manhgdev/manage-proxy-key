package proxy

import (
	"fmt"
	"io"
	"net"
)

// SOCKS5Auth xử lý xác thực SOCKS5
func SOCKS5Auth(clientConn net.Conn) (bool, error) {
	// Đọc phiên bản SOCKS và số phương thức xác thực
	header := make([]byte, 2)
	if _, err := io.ReadFull(clientConn, header); err != nil {
		return false, fmt.Errorf("failed to read SOCKS5 header: %v", err)
	}

	if header[0] != SOCKS5_VERSION {
		return false, fmt.Errorf("unsupported SOCKS version: %d", header[0])
	}

	// Đọc danh sách phương thức xác thực được hỗ trợ
	methodCount := int(header[1])
	methods := make([]byte, methodCount)
	if _, err := io.ReadFull(clientConn, methods); err != nil {
		return false, fmt.Errorf("failed to read authentication methods: %v", err)
	}

	// Kiểm tra xem có phương thức xác thực username/password không
	hasUserPass := false
	for _, method := range methods {
		if method == 0x02 {
			hasUserPass = true
			break
		}
	}

	if !hasUserPass {
		// Nếu không có phương thức xác thực username/password, trả về lỗi
		clientConn.Write([]byte{SOCKS5_VERSION, 0xFF})
		return false, fmt.Errorf("username/password authentication not supported")
	}

	// Gửi thông báo chọn phương thức xác thực username/password
	clientConn.Write([]byte{SOCKS5_VERSION, 0x02})

	// Đọc thông tin xác thực
	authHeader := make([]byte, 1)
	if _, err := io.ReadFull(clientConn, authHeader); err != nil {
		return false, fmt.Errorf("failed to read auth header: %v", err)
	}

	if authHeader[0] != 0x01 {
		return false, fmt.Errorf("unsupported auth version: %d", authHeader[0])
	}

	// Đọc độ dài username
	usernameLen := make([]byte, 1)
	if _, err := io.ReadFull(clientConn, usernameLen); err != nil {
		return false, fmt.Errorf("failed to read username length: %v", err)
	}

	// Đọc username
	username := make([]byte, usernameLen[0])
	if _, err := io.ReadFull(clientConn, username); err != nil {
		return false, fmt.Errorf("failed to read username: %v", err)
	}

	// Đọc độ dài password
	passwordLen := make([]byte, 1)
	if _, err := io.ReadFull(clientConn, passwordLen); err != nil {
		return false, fmt.Errorf("failed to read password length: %v", err)
	}

	// Đọc password
	password := make([]byte, passwordLen[0])
	if _, err := io.ReadFull(clientConn, password); err != nil {
		return false, fmt.Errorf("failed to read password: %v", err)
	}

	// Kiểm tra thông tin xác thực
	if string(username) != "zpoxy" || string(password) != "manhdz" {
		// Gửi thông báo xác thực thất bại
		clientConn.Write([]byte{0x01, 0x01})
		return false, fmt.Errorf("invalid credentials")
	}

	// Gửi thông báo xác thực thành công
	clientConn.Write([]byte{0x01, 0x00})
	return true, nil
}
