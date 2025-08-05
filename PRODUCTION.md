# Production Deployment Guide

## Phase 3: Production Readiness Implementation

This guide covers the production deployment and monitoring setup for the microservices platform.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Options](#deployment-options)
4. [Monitoring & Observability](#monitoring--observability)
5. [Security Configuration](#security-configuration)
6. [Operations](#operations)
7. [Troubleshooting](#troubleshooting)

## Architecture Overview

### Production Architecture Components

- **Process Management**: PM2 with clustering and auto-restart
- **Load Balancing**: Nginx reverse proxy with health checks
- **Monitoring**: Prometheus + Grafana + Loki stack
- **Logging**: Structured logging with Pino.js
- **Caching**: Redis with high availability configuration
- **Security**: TLS termination, security headers, rate limiting

### Services

- **auth-service** (Port 3001): Authentication and authorization
- **data-service** (Port 3002): Data management and persistence  
- **processing-service** (Port 3003): Business logic processing
- **integration-service** (Port 3004): External system integrations
- **notification-service** (Port 3005): Notifications and messaging

## Prerequisites

### System Requirements

- **OS**: Ubuntu 20.04+ / RHEL 8+ / Amazon Linux 2
- **Memory**: Minimum 4GB RAM (8GB+ recommended)
- **CPU**: 2+ cores (4+ cores recommended)
- **Storage**: 20GB+ available space
- **Network**: Ports 80, 443, 3001-3005, 6379, 9090, 3000 accessible

### Software Dependencies

```bash
# Install Bun.js
curl -fsSL https://bun.sh/install | bash

# Install Node.js (for PM2)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install Redis
sudo apt-get install -y redis-server

# Install Nginx
sudo apt-get install -y nginx

# Install Docker & Docker Compose (optional)
sudo apt-get install -y docker.io docker-compose
```

## Deployment Options

### Option 1: PM2 Native Deployment (Recommended)

#### 1. Prepare the Environment

```bash
# Clone the repository
git clone <repository-url>
cd bun-redis-starter

# Install dependencies
bun install

# Build all services
bun run build
```

#### 2. Configure Environment Variables

Create `.env.production`:

```env
# Database
DATABASE_PATH=./data/production.db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password

# JWT
JWT_SECRET=your-super-secure-jwt-secret-key
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

# CORS
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Logging
LOG_LEVEL=info

# SSL/TLS
SSL_CERT_PATH=/etc/ssl/certs/microservices.crt
SSL_KEY_PATH=/etc/ssl/private/microservices.key
```

#### 3. Deploy with Production Script

```bash
# Deploy with blue-green strategy
./scripts/deploy.sh production blue-green

# Or deploy to staging first
./scripts/deploy.sh staging blue-green
```

#### 4. Configure Nginx Load Balancer

```bash
# Copy nginx configuration
sudo cp infrastructure/nginx/nginx.conf /etc/nginx/nginx.conf

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Option 2: Docker Deployment

#### 1. Deploy with Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Stop services
docker-compose -f docker-compose.production.yml down
```

#### 2. Monitor Docker Services

```bash
# Check service status
docker-compose -f docker-compose.production.yml ps

# View specific service logs
docker-compose -f docker-compose.production.yml logs -f auth-service
```

## Monitoring & Observability

### Metrics Collection

All services expose metrics at `/metrics` and `/metrics/prometheus` endpoints:

- **JSON Format**: `http://service:port/metrics`
- **Prometheus Format**: `http://service:port/metrics/prometheus`

### Health Checks

Health check endpoints available at `/health`:

- **Individual Service**: `http://service:port/health`
- **Global Health**: `http://nginx/health`

### Monitoring Stack

#### Prometheus Configuration

Prometheus scrapes metrics from all services automatically. Configuration in `infrastructure/monitoring/prometheus.yml`.

#### Grafana Dashboards

- **URL**: `http://localhost:3000`
- **Default Login**: `admin/admin123`
- **Dashboards**: Microservices Overview, Service Details, Infrastructure

#### Log Aggregation

Loki aggregates logs from all services:

- **Loki URL**: `http://localhost:3100`
- **Log Sources**: Application logs, Nginx logs, System logs

### Alerting

#### Critical Alerts

- Service down (any service unavailable)
- High error rate (>5% error rate for 5 minutes)
- High response time (>1s 95th percentile for 5 minutes)
- Memory usage high (>80% for 10 minutes)

#### Warning Alerts

- CPU usage high (>70% for 15 minutes)
- Disk space low (<20% remaining)
- Redis connection issues

## Security Configuration

### TLS/SSL Setup

#### 1. Generate SSL Certificates

```bash
# For development/testing (self-signed)
mkdir -p infrastructure/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout infrastructure/ssl/microservices.key \
    -out infrastructure/ssl/microservices.crt

# For production, use Let's Encrypt
sudo certbot --nginx -d yourdomain.com
```

#### 2. Security Headers

All services automatically include security headers:

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy: (configured)
- Strict-Transport-Security: (HTTPS only)

#### 3. Rate Limiting

Configured at multiple levels:

- **Nginx**: 10 req/s general, 5 req/s auth endpoints
- **Application**: Configurable per endpoint
- **Redis**: Distributed rate limiting (optional)

### Authentication & Authorization

- **JWT Tokens**: Secure token generation and validation
- **Role-based Access**: Configurable role requirements
- **Refresh Tokens**: Secure token refresh mechanism

## Operations

### Backup Procedures

#### Automated Backups

```bash
# Create backup
./scripts/backup.sh backup

# List available backups
./scripts/backup.sh list

# Restore from backup
./scripts/backup.sh restore backups/backup_20240101_120000.tar.gz
```

#### Manual Backup Components

1. **SQLite Databases**: All service databases
2. **Redis Data**: Session and cache data
3. **Configuration Files**: Environment and service configs
4. **SSL Certificates**: TLS certificates and keys

### Load Testing

#### Production Readiness Testing

```bash
# Basic load test
./scripts/load-test.sh

# Extended load test
./scripts/load-test.sh http://localhost 300 50

# Production environment test
./scripts/load-test.sh https://yourdomain.com 120 20
```

### Service Management

#### PM2 Commands

```bash
# Start production services
bun run production:start

# Stop services
bun run production:stop

# Restart services
bun run production:restart

# View logs
bun run production:logs

# Monitor processes
pm2 monit
```

#### Individual Service Management

```bash
# Restart specific service
pm2 restart auth-service

# View service logs
pm2 logs auth-service

# View service details
pm2 describe auth-service
```

### Scaling

#### Horizontal Scaling

1. **Add Service Instances**: Update PM2 configuration
2. **Load Balancer**: Add upstream servers in Nginx
3. **Database**: Consider read replicas for high load
4. **Redis**: Configure Redis cluster for high availability

#### Vertical Scaling

- **Memory Limits**: Update PM2 memory restart thresholds
- **CPU Allocation**: Adjust PM2 instance counts
- **Connection Limits**: Tune database and Redis connections

## Troubleshooting

### Common Issues

#### Service Won't Start

```bash
# Check service logs
pm2 logs service-name

# Check system resources
free -h
df -h

# Verify dependencies
redis-cli ping
```

#### High Memory Usage

```bash
# Check memory usage per service
pm2 monit

# Check system memory
free -h

# Review memory limits
pm2 describe service-name
```

#### Database Issues

```bash
# Check database file permissions
ls -la services/*/data/

# Verify database integrity
sqlite3 services/auth/data/auth.db "PRAGMA integrity_check;"

# Check database locks
lsof | grep -i database
```

#### Network Issues

```bash
# Check port availability
netstat -tlnp | grep :3001

# Test service connectivity
curl -v http://localhost:3001/health

# Check nginx status
sudo systemctl status nginx
```

### Health Check Diagnostics

#### Service Health Check

```bash
# Check individual service health
curl -s http://localhost:3001/health | jq '.'

# Check all services
for port in 3001 3002 3003 3004 3005; do
  echo "Service on port $port:"
  curl -s http://localhost:$port/health | jq '.status'
done
```

#### Infrastructure Health Check

```bash
# Check Redis
redis-cli ping

# Check Nginx
curl -s http://localhost/health

# Check disk space
df -h

# Check system load
uptime
```

### Performance Monitoring

#### Real-time Metrics

```bash
# View live metrics
curl -s http://localhost:3001/metrics | jq '.'

# Monitor request rates
watch -n 5 'curl -s http://localhost:3001/metrics | jq ".requests.perSecond"'
```

#### Performance Analysis

1. **Response Times**: Monitor via Grafana dashboards
2. **Error Rates**: Check application logs and metrics
3. **Resource Usage**: Monitor CPU, memory, and disk I/O
4. **Database Performance**: Track query times and connections

### Emergency Procedures

#### Service Recovery

```bash
# Quick restart all services
pm2 restart ecosystem.production.config.js

# Rollback deployment
./scripts/deploy.sh production blue-green true

# Restore from backup
./scripts/backup.sh restore latest
```

#### Data Recovery

1. **Stop Services**: `pm2 stop ecosystem.production.config.js`  
2. **Restore Backup**: `./scripts/backup.sh restore <backup-file>`
3. **Verify Integrity**: Run health checks
4. **Restart Services**: `pm2 start ecosystem.production.config.js`

## Support & Maintenance

### Monitoring Checklist

- [ ] All services responding to health checks
- [ ] Error rates within acceptable limits (<1%)
- [ ] Response times meeting SLA requirements (<500ms 95th percentile)
- [ ] Memory usage stable and within limits
- [ ] CPU usage reasonable (<70% average)
- [ ] Disk space sufficient (>20% free)
- [ ] Backup procedures running successfully
- [ ] SSL certificates valid and not expiring soon
- [ ] Security headers properly configured
- [ ] Rate limiting functioning correctly

### Regular Maintenance

#### Daily

- Check service health status
- Review error logs
- Monitor resource usage
- Verify backup completion

#### Weekly

- Review performance metrics
- Update system packages
- Check SSL certificate expiry
- Clean old log files

#### Monthly

- Performance optimization review
- Security audit
- Backup restoration test
- Load testing validation
- Documentation updates

For additional support, refer to the service-specific documentation in each service directory.