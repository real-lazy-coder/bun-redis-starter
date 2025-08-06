#!/bin/bash

# Production Deployment Script
# This script handles blue-green deployment with health checks and rollback capability

set -e

# Configuration
DEPLOYMENT_ENV=${1:-production}
DEPLOYMENT_TYPE=${2:-blue-green}
HEALTH_CHECK_TIMEOUT=${3:-30}
ROLLBACK_ON_FAILURE=${4:-true}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 is not installed. Please install PM2 first."
        exit 1
    fi
    
    # Check if Bun is installed
    if ! command -v bun &> /dev/null; then
        log_error "Bun is not installed. Please install Bun first."
        exit 1
    fi
    
    # Check if required directories exist
    mkdir -p logs
    mkdir -p backups
    
    log_success "Prerequisites check completed"
}

# Create backup of current deployment
create_backup() {
    log_info "Creating backup of current deployment..."
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="backups/deployment_${timestamp}"
    
    mkdir -p "$backup_dir"
    
    # Backup PM2 process list
    pm2 jlist > "$backup_dir/pm2_processes.json" 2>/dev/null || true
    
    # Backup environment configuration
    cp -r services "$backup_dir/" 2>/dev/null || true
    cp ecosystem*.config.js "$backup_dir/" 2>/dev/null || true
    
    echo "$backup_dir" > .last_backup
    log_success "Backup created at $backup_dir"
}

# Install dependencies and build
build_services() {
    log_info "Installing dependencies and building services..."
    
    # Install root dependencies
    bun install
    
    # Build shared libraries first
    bun run build:shared
    
    # Build all services
    bun run build:services
    
    log_success "Build completed successfully"
}

# Health check function
health_check() {
    local service_name=$1
    local port=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    log_info "Performing health check for $service_name on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:$port/health >/dev/null 2>&1; then
            log_success "$service_name health check passed"
            return 0
        fi
        
        log_warning "Health check attempt $attempt/$max_attempts failed for $service_name"
        sleep 2
        ((attempt++))
    done
    
    log_error "Health check failed for $service_name after $max_attempts attempts"
    return 1
}

# Deploy services with blue-green strategy
deploy_blue_green() {
    log_info "Starting blue-green deployment..."
    
    # Stop existing processes gracefully
    pm2 stop ecosystem.production.config.js 2>/dev/null || true
    
    # Start new processes
    pm2 start ecosystem.production.config.js --env=$DEPLOYMENT_ENV
    
    # Wait for processes to initialize
    sleep 5
    
    # Perform health checks for all services
    local services=(
        "auth-service:3001"
        "data-service:3002" 
        "processing-service:3003"
        "integration-service:3004"
        "notification-service:3005"
    )
    
    local failed_services=()
    
    for service_port in "${services[@]}"; do
        IFS=':' read -r service port <<< "$service_port"
        if ! health_check "$service" "$port" "$HEALTH_CHECK_TIMEOUT"; then
            failed_services+=("$service")
        fi
    done
    
    if [ ${#failed_services[@]} -gt 0 ]; then
        log_error "Health checks failed for services: ${failed_services[*]}"
        
        if [ "$ROLLBACK_ON_FAILURE" = "true" ]; then
            rollback_deployment
        fi
        
        exit 1
    fi
    
    log_success "Blue-green deployment completed successfully"
}

# Rollback to previous deployment
rollback_deployment() {
    log_warning "Rolling back deployment..."
    
    if [ ! -f .last_backup ]; then
        log_error "No backup found for rollback"
        return 1
    fi
    
    local backup_dir=$(cat .last_backup)
    
    if [ ! -d "$backup_dir" ]; then
        log_error "Backup directory $backup_dir not found"
        return 1
    fi
    
    # Stop current processes
    pm2 stop all 2>/dev/null || true
    pm2 delete all 2>/dev/null || true
    
    # Restore from backup if available
    if [ -f "$backup_dir/pm2_processes.json" ]; then
        pm2 resurrect "$backup_dir/pm2_processes.json" 2>/dev/null || true
    fi
    
    log_success "Rollback completed"
}

# Database migration
migrate_databases() {
    log_info "Running database migrations..."
    
    # Run migrations for all services
    bun run db:migrate
    
    log_success "Database migrations completed"
}

# Post-deployment verification
post_deployment_verification() {
    log_info "Running post-deployment verification..."
    
    # Check PM2 process status
    pm2 status
    
    # Verify all services are running
    local running_processes=$(pm2 jlist | jq -r '.[] | select(.pm2_env.status == "online") | .name' | wc -l)
    local expected_processes=5
    
    if [ "$running_processes" -ne "$expected_processes" ]; then
        log_error "Expected $expected_processes processes running, but found $running_processes"
        return 1
    fi
    
    # Final health check round
    local services=(
        "auth-service:3001"
        "data-service:3002"
        "processing-service:3003" 
        "integration-service:3004"
        "notification-service:3005"
    )
    
    for service_port in "${services[@]}"; do
        IFS=':' read -r service port <<< "$service_port"
        if ! health_check "$service" "$port" 5; then
            log_error "Post-deployment health check failed for $service"
            return 1
        fi
    done
    
    log_success "Post-deployment verification completed successfully"
}

# Cleanup old backups (keep last 10)
cleanup_backups() {
    log_info "Cleaning up old backups..."
    
    cd backups
    ls -t deployment_* 2>/dev/null | tail -n +11 | xargs rm -rf 2>/dev/null || true
    cd ..
    
    log_success "Backup cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting deployment process for environment: $DEPLOYMENT_ENV"
    
    # Pre-deployment checks
    check_prerequisites
    
    # Create backup before deployment
    create_backup
    
    # Build and prepare services
    build_services
    
    # Run database migrations
    migrate_databases
    
    # Deploy based on strategy
    case $DEPLOYMENT_TYPE in
        "blue-green")
            deploy_blue_green
            ;;
        *)
            log_error "Unsupported deployment type: $DEPLOYMENT_TYPE"
            exit 1
            ;;
    esac
    
    # Post-deployment verification
    post_deployment_verification
    
    # Cleanup
    cleanup_backups
    
    log_success "Deployment completed successfully!"
    log_info "Services are now running. Use 'pm2 status' to check process status."
    log_info "Use 'pm2 logs' to view service logs."
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi