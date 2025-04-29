package proxy

import (
	"encoding/base64"
	"fmt"
	"strings"
)

// checkAuth kiểm tra xác thực proxy
func checkAuth(headers map[string]string) (bool, string) {
	auth := headers["Proxy-Authorization"]
	if auth == "" {
		return false, "Missing Proxy-Authorization header"
	}

	if !strings.HasPrefix(auth, "Basic ") {
		return false, "Invalid authentication method, expected Basic"
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(auth, "Basic "))
	if err != nil {
		return false, fmt.Sprintf("Invalid base64 encoding: %v", err)
	}

	// Kiểm tra thông tin đăng nhập
	credentials := string(decoded)
	expectedCredentials := "zpoxy:manhdz"

	if credentials != expectedCredentials {
		return false, fmt.Sprintf("Invalid credentials: %s", credentials)
	}

	return true, ""
}
