#!/bin/bash

# Load Testing Script for Production Readiness Validation
# Tests all microservices endpoints under various load conditions

set -e

# Configuration
BASE_URL="${1:-http://localhost}"
DURATION="${2:-60}"
CONCURRENT_USERS="${3:-10}"
RAMP_UP_TIME="${4:-30}"

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
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_warning "jq not found - JSON parsing will be limited"
    fi
    
    log_success "Prerequisites check completed"
}

# Health check before load testing
pre_test_health_check() {
    log_info "Performing pre-test health checks..."
    
    local services=(
        "auth:3001"
        "data:3002"
        "processing:3003"
        "integration:3004"
        "notification:3005"
    )
    
    local failed_services=()
    
    for service_port in "${services[@]}"; do
        IFS=':' read -r service port <<< "$service_port"
        local url="${BASE_URL}:${port}/health"
        
        log_info "Checking health of $service at $url"
        
        if curl -f -s "$url" >/dev/null; then
            log_success "$service is healthy"
        else
            log_error "$service health check failed"
            failed_services+=("$service")
        fi
    done
    
    if [ ${#failed_services[@]} -gt 0 ]; then
        log_error "Health checks failed for: ${failed_services[*]}"
        log_error "Aborting load test due to unhealthy services"
        exit 1
    fi
    
    log_success "All services are healthy - proceeding with load test"
}

# Simple load test function using curl
simple_load_test() {
    local service_name=$1
    local port=$2
    local endpoint=$3
    local method=${4:-GET}
    local duration=$5
    local concurrent=$6
    
    log_info "Load testing $service_name$endpoint ($method) - ${concurrent} concurrent for ${duration}s"
    
    local url="${BASE_URL}:${port}${endpoint}"
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    local request_count=0
    local success_count=0
    local error_count=0
    local total_time=0
    
    # Create temporary files for results
    local temp_dir="/tmp/load_test_$$"
    mkdir -p "$temp_dir"
    
    # Function to make requests
    make_requests() {
        local worker_id=$1
        local worker_requests=0
        local worker_success=0
        local worker_errors=0
        local worker_total_time=0
        
        while [ $(date +%s) -lt $end_time ]; do
            local request_start=$(date +%s%3N)
            
            if curl -f -s -X "$method" "$url" >/dev/null 2>&1; then
                ((worker_success++))
            else
                ((worker_errors++))
            fi
            
            local request_end=$(date +%s%3N)
            local request_duration=$((request_end - request_start))
            worker_total_time=$((worker_total_time + request_duration))
            ((worker_requests++))
            
            # Small delay to prevent overwhelming
            sleep 0.1
        done
        
        # Write results to temp file
        echo "$worker_requests $worker_success $worker_errors $worker_total_time" > "$temp_dir/worker_$worker_id"
    }
    
    # Start concurrent workers
    local pids=()
    for ((i=1; i<=concurrent; i++)); do
        make_requests $i &
        pids+=($!)
    done
    
    # Wait for all workers to complete
    for pid in "${pids[@]}"; do
        wait $pid
    done
    
    # Aggregate results
    for ((i=1; i<=concurrent; i++)); do
        if [ -f "$temp_dir/worker_$i" ]; then
            read -r worker_requests worker_success worker_errors worker_total_time < "$temp_dir/worker_$i"
            request_count=$((request_count + worker_requests))
            success_count=$((success_count + worker_success))
            error_count=$((error_count + worker_errors))
            total_time=$((total_time + worker_total_time))
        fi
    done
    
    # Calculate metrics
    local actual_duration=$(($(date +%s) - start_time))
    local rps=$(echo "scale=2; $request_count / $actual_duration" | bc 2>/dev/null || echo "N/A")
    local avg_response_time=$(echo "scale=2; $total_time / $request_count" | bc 2>/dev/null || echo "N/A")
    local success_rate=$(echo "scale=2; $success_count * 100 / $request_count" | bc 2>/dev/null || echo "N/A")
    
    # Report results
    log_success "Load test completed for $service_name$endpoint"
    echo "  Duration: ${actual_duration}s"
    echo "  Total Requests: $request_count"
    echo "  Successful: $success_count"
    echo "  Errors: $error_count"
    echo "  Requests/sec: $rps"
    echo "  Avg Response Time: ${avg_response_time}ms"
    echo "  Success Rate: ${success_rate}%"
    echo ""
    
    # Cleanup temp files
    rm -rf "$temp_dir"
    
    # Return error if success rate is too low
    if [ "$error_count" -gt $((request_count / 10)) ]; then
        log_warning "$service_name$endpoint has high error rate: $error_count errors out of $request_count requests"
        return 1
    fi
    
    return 0
}

# Comprehensive load test for all services
run_comprehensive_load_test() {
    log_info "Starting comprehensive load test..."
    log_info "Configuration: ${CONCURRENT_USERS} concurrent users, ${DURATION}s duration"
    
    local failed_tests=()
    
    # Test auth service endpoints
    log_info "Testing Auth Service endpoints..."
    simple_load_test "auth-service" "3001" "/" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("auth-service-root")
    simple_load_test "auth-service" "3001" "/health" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("auth-service-health")
    simple_load_test "auth-service" "3001" "/metrics" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("auth-service-metrics")
    
    # Test data service endpoints
    log_info "Testing Data Service endpoints..."
    simple_load_test "data-service" "3002" "/" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("data-service-root")
    simple_load_test "data-service" "3002" "/health" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("data-service-health")
    simple_load_test "data-service" "3002" "/metrics" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("data-service-metrics")
    
    # Test processing service endpoints
    log_info "Testing Processing Service endpoints..."
    simple_load_test "processing-service" "3003" "/" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("processing-service-root")
    simple_load_test "processing-service" "3003" "/health" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("processing-service-health")
    simple_load_test "processing-service" "3003" "/metrics" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("processing-service-metrics")
    
    # Test integration service endpoints
    log_info "Testing Integration Service endpoints..."
    simple_load_test "integration-service" "3004" "/" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("integration-service-root")
    simple_load_test "integration-service" "3004" "/health" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("integration-service-health")
    simple_load_test "integration-service" "3004" "/metrics" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("integration-service-metrics")
    
    # Test notification service endpoints
    log_info "Testing Notification Service endpoints..."
    simple_load_test "notification-service" "3005" "/" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("notification-service-root")
    simple_load_test "notification-service" "3005" "/health" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("notification-service-health")
    simple_load_test "notification-service" "3005" "/metrics" "GET" "$DURATION" "$CONCURRENT_USERS" || failed_tests+=("notification-service-metrics")
    
    # Summary
    if [ ${#failed_tests[@]} -eq 0 ]; then
        log_success "All load tests passed successfully!"
        log_success "Platform is ready for production load"
    else
        log_error "Some load tests failed: ${failed_tests[*]}"
        log_error "Review failing endpoints before production deployment"
        return 1
    fi
}

# Post-test health check
post_test_health_check() {
    log_info "Performing post-test health checks..."
    
    # Give services a moment to recover
    sleep 5
    
    local services=(
        "auth:3001"
        "data:3002"
        "processing:3003"
        "integration:3004"
        "notification:3005"
    )
    
    local failed_services=()
    
    for service_port in "${services[@]}"; do
        IFS=':' read -r service port <<< "$service_port"
        local url="${BASE_URL}:${port}/health"
        
        if curl -f -s "$url" >/dev/null; then
            log_success "$service recovered successfully after load test"
        else
            log_error "$service failed to recover after load test"
            failed_services+=("$service")
        fi
    done
    
    if [ ${#failed_services[@]} -gt 0 ]; then
        log_error "Services failed to recover: ${failed_services[*]}"
        return 1
    fi
    
    log_success "All services recovered successfully after load test"
}

# Show usage
show_usage() {
    echo "Usage: $0 [base_url] [duration_seconds] [concurrent_users] [ramp_up_time]"
    echo ""
    echo "Parameters:"
    echo "  base_url         Base URL for services (default: http://localhost)"
    echo "  duration_seconds Duration in seconds for each test (default: 60)"
    echo "  concurrent_users Number of concurrent users (default: 10)"
    echo "  ramp_up_time     Ramp up time in seconds (default: 30)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Use defaults"
    echo "  $0 http://localhost 120 20           # 2 min test with 20 users"
    echo "  $0 https://prod.example.com 300 50   # 5 min production test"
}

# Main execution
main() {
    log_info "Starting production load testing suite"
    log_info "Target: $BASE_URL"
    log_info "Duration: ${DURATION}s per test"
    log_info "Concurrent Users: $CONCURRENT_USERS"
    
    check_prerequisites
    pre_test_health_check
    run_comprehensive_load_test
    post_test_health_check
    
    log_success "Load testing completed successfully!"
    log_info "Platform is validated for production deployment"
}

# Handle command line arguments
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    show_usage
    exit 0
fi

# Check if bc is available for calculations
if ! command -v bc &> /dev/null; then
    log_warning "bc not found - calculation accuracy may be reduced"
fi

# Run main function
main "$@"