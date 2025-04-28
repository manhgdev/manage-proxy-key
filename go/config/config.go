package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	ProxyURL string
}

var AppConfig Config

func LoadConfig() error {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		return err
	}

	AppConfig = Config{
		ProxyURL: getEnv("URL_PROXY", "http://localhost:3000/api/proxy/random"),
	}

	return nil
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
