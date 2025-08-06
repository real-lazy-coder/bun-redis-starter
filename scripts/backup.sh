#!/bin/bash

# Backup and Restore Script for Production Data
# Handles SQLite databases, Redis data, and configuration backup

set -e

# Configuration
BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_${TIMESTAMP}"
RETENTION_DAYS=30

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

# Create backup directory
ensure_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    log_info "Backup directory ensured: $BACKUP_DIR"
}

# Backup SQLite databases
backup_databases() {
    local backup_path="$1"
    log_info "Backing up SQLite databases..."
    
    # Find all SQLite database files
    local db_files=(
        "services/auth/data/auth.db"
        "services/data/data/data.db"
        "services/processing/data/processing.db"
        "services/integration/data/integration.db"
        "services/notification/data/notification.db"
    )
    
    mkdir -p "$backup_path/databases"
    
    for db_file in "${db_files[@]}"; do
        if [ -f "$db_file" ]; then
            local db_name=$(basename "$db_file")
            local service_name=$(echo "$db_file" | cut -d'/' -f2)
            
            # Create backup using SQLite backup command for consistency
            sqlite3 "$db_file" ".backup '$backup_path/databases/${service_name}_${db_name}'"
            
            if [ $? -eq 0 ]; then
                log_success "Backed up database: $db_file"
            else
                log_error "Failed to backup database: $db_file"
                return 1
            fi
        else
            log_warning "Database file not found: $db_file"
        fi
    done
    
    log_success "Database backup completed"
}

# Backup Redis data
backup_redis() {
    local backup_path="$1"
    log_info "Backing up Redis data..."
    
    mkdir -p "$backup_path/redis"
    
    # Redis backup using BGSAVE
    local redis_host=${REDIS_HOST:-localhost}
    local redis_port=${REDIS_PORT:-6379}
    
    # Check if Redis is available
    if redis-cli -h "$redis_host" -p "$redis_port" ping >/dev/null 2>&1; then
        # Trigger background save
        redis-cli -h "$redis_host" -p "$redis_port" BGSAVE
        
        # Wait for background save to complete
        while [ "$(redis-cli -h "$redis_host" -p "$redis_port" LASTSAVE)" -eq "$(redis-cli -h "$redis_host" -p "$redis_port" LASTSAVE)" ]; do
            sleep 1
        done
        
        # Copy the dump file
        local redis_data_dir="/var/lib/redis"
        if [ -f "${redis_data_dir}/dump.rdb" ]; then
            cp "${redis_data_dir}/dump.rdb" "$backup_path/redis/dump.rdb"
            log_success "Redis data backed up"
        else
            log_warning "Redis dump file not found at expected location"
        fi
    else
        log_warning "Redis server not available for backup"
    fi
}

# Backup configuration files
backup_config() {
    local backup_path="$1"
    log_info "Backing up configuration files..."
    
    mkdir -p "$backup_path/config"
    
    # Backup ecosystem configurations
    cp ecosystem*.config.js "$backup_path/config/" 2>/dev/null || true
    
    # Backup service configurations (excluding sensitive data)
    find services -name "*.config.js" -o -name "*.config.json" | while read -r config_file; do
        cp "$config_file" "$backup_path/config/" 2>/dev/null || true
    done
    
    # Backup package.json files
    cp package.json "$backup_path/config/" 2>/dev/null || true
    find services -name "package.json" | while read -r pkg_file; do
        local service_name=$(dirname "$pkg_file" | xargs basename)
        cp "$pkg_file" "$backup_path/config/${service_name}_package.json" 2>/dev/null || true
    done
    
    log_success "Configuration backup completed"
}

# Backup logs
backup_logs() {
    local backup_path="$1"
    log_info "Backing up recent logs..."
    
    mkdir -p "$backup_path/logs"
    
    # Backup PM2 logs from last 24 hours
    if [ -d logs ]; then
        find logs -name "*.log" -mtime -1 -exec cp {} "$backup_path/logs/" \; 2>/dev/null || true
    fi
    
    # Backup system logs if available
    if [ -f /var/log/syslog ]; then
        tail -n 1000 /var/log/syslog > "$backup_path/logs/system.log" 2>/dev/null || true
    fi
    
    log_success "Log backup completed"
}

# Create backup metadata
create_backup_metadata() {
    local backup_path="$1"
    
    cat > "$backup_path/metadata.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "backup_name": "$BACKUP_NAME",
  "version": "$(cat package.json | jq -r .version 2>/dev/null || echo 'unknown')",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "bun_version": "$(bun --version 2>/dev/null || echo 'unknown')",
  "hostname": "$(hostname)",
  "user": "$(whoami)",
  "services": [
    "auth-service",
    "data-service", 
    "processing-service",
    "integration-service",
    "notification-service"
  ],
  "backup_size": "$(du -sh "$backup_path" | cut -f1)"
}
EOF
    
    log_success "Backup metadata created"
}

# Compress backup
compress_backup() {
    local backup_path="$1"
    log_info "Compressing backup..."
    
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$(basename "$backup_path")"
    
    if [ $? -eq 0 ]; then
        rm -rf "$(basename "$backup_path")"
        log_success "Backup compressed: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
        echo "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
    else
        log_error "Failed to compress backup"
        return 1
    fi
    
    cd - >/dev/null
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups (older than $RETENTION_DAYS days)..."
    
    find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    
    log_success "Old backups cleaned up"
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_info "Restoring from backup: $backup_file"
    
    # Stop services before restore
    pm2 stop all 2>/dev/null || true
    
    # Extract backup
    local restore_dir="/tmp/restore_$(date +%s)"
    mkdir -p "$restore_dir"
    tar -xzf "$backup_file" -C "$restore_dir"
    
    local backup_content=$(find "$restore_dir" -maxdepth 1 -type d | tail -n 1)
    
    # Restore databases
    if [ -d "$backup_content/databases" ]; then
        log_info "Restoring databases..."
        
        for db_backup in "$backup_content/databases"/*.db; do
            if [ -f "$db_backup" ]; then
                local db_name=$(basename "$db_backup")
                local service_name=$(echo "$db_name" | cut -d'_' -f1)
                local target_db="services/$service_name/data/$(echo "$db_name" | cut -d'_' -f2-)"
                
                # Create directory if it doesn't exist
                mkdir -p "$(dirname "$target_db")"
                
                # Restore database
                cp "$db_backup" "$target_db"
                log_success "Restored database: $target_db"
            fi
        done
    fi
    
    # Restore Redis data
    if [ -f "$backup_content/redis/dump.rdb" ]; then
        log_info "Restoring Redis data..."
        local redis_data_dir="/var/lib/redis"
        
        if [ -d "$redis_data_dir" ]; then
            cp "$backup_content/redis/dump.rdb" "$redis_data_dir/dump.rdb"
            log_success "Redis data restored"
        else
            log_warning "Redis data directory not found for restore"
        fi
    fi
    
    # Restore configuration files
    if [ -d "$backup_content/config" ]; then
        log_info "Restoring configuration files..."
        
        # Restore ecosystem configs
        cp "$backup_content/config"/ecosystem*.config.js . 2>/dev/null || true
        
        log_success "Configuration files restored"
    fi
    
    # Cleanup
    rm -rf "$restore_dir"
    
    log_success "Restore completed successfully"
    log_info "Please restart services with: pm2 start ecosystem.production.config.js"
}

# List available backups
list_backups() {
    log_info "Available backups:"
    
    if [ -d "$BACKUP_DIR" ]; then
        ls -la "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | while read -r line; do
            echo "  $line"
        done
    else
        log_info "No backup directory found"
    fi
}

# Main backup function
perform_backup() {
    log_info "Starting backup process..."
    
    ensure_backup_dir
    
    local backup_path="$BACKUP_DIR/$BACKUP_NAME"
    mkdir -p "$backup_path"
    
    # Perform backup operations
    backup_databases "$backup_path"
    backup_redis "$backup_path"
    backup_config "$backup_path"
    backup_logs "$backup_path"
    create_backup_metadata "$backup_path"
    
    # Compress and cleanup
    local compressed_backup=$(compress_backup "$backup_path")
    cleanup_old_backups
    
    log_success "Backup completed successfully: $compressed_backup"
}

# Show usage
show_usage() {
    echo "Usage: $0 {backup|restore|list} [options]"
    echo ""
    echo "Commands:"
    echo "  backup              Create a new backup"
    echo "  restore <file>      Restore from backup file"
    echo "  list               List available backups"
    echo ""
    echo "Examples:"
    echo "  $0 backup"
    echo "  $0 restore backups/backup_20240101_120000.tar.gz"
    echo "  $0 list"
}

# Main script logic
case "$1" in
    backup)
        perform_backup
        ;;
    restore)
        if [ -z "$2" ]; then
            log_error "Please specify backup file to restore"
            show_usage
            exit 1
        fi
        restore_backup "$2"
        ;;
    list)
        list_backups
        ;;
    *)
        show_usage
        exit 1
        ;;
esac