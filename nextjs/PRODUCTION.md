# Hướng dẫn triển khai Production

## Yêu cầu hệ thống
- Node.js 18+ hoặc Bun 1.0+
- 1GB RAM trở lên
- 1 CPU core trở lên

## Các bước triển khai

1. Cài đặt dependencies:
```bash
bun install --production
```

2. Build ứng dụng:
```bash
bun run build
```

3. Chạy ứng dụng ở chế độ production:
```bash
bun run start:prod
```

## Cấu hình Nginx (Khuyến nghị)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Cấu hình PM2 (Khuyến nghị)

1. Cài đặt PM2:
```bash
bun install -g pm2
```

2. Tạo file ecosystem.config.js:
```javascript
module.exports = {
  apps: [{
    name: 'proxy-key-manager',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 8000
    }
  }]
}
```

3. Chạy với PM2:
```bash
pm2 start ecosystem.config.js
```

## Monitoring

- Sử dụng PM2 để monitor:
```bash
pm2 monit
```

- Xem logs:
```bash
pm2 logs
```

## Backup

- Backup database:
```bash
cp ./data/proxy.db ./backup/proxy.db.$(date +%Y%m%d)
```

## Security

- Đảm bảo file .env.production không được commit lên git
- Cấu hình firewall chỉ cho phép port 80 và 443
- Sử dụng SSL/TLS cho domain
- Thường xuyên cập nhật dependencies 