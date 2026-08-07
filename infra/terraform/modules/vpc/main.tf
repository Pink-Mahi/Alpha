# VPC module — M0 skeleton. Creates VPC, public/private subnets, NAT,
# DB + Elasticache subnet groups, and basic security groups.

variable "name" { type = string }
variable "region" { type = string }
variable "cidr" { type = string }

# Real implementation: aws_vpc, aws_subnet (x AZs), aws_internet_gateway,
# aws_nat_gateway, aws_route_table, aws_db_subnet_group, aws_elasticache_subnet_group,
# aws_security_group (db, redis, eks).
# Stubbed outputs so the root module type-checks; fill in before `terraform plan`.

output "private_subnet_ids" { value = [] }
output "db_subnet_group_name" { value = "${var.name}-db" }
output "elasticache_subnet_group_name" { value = "${var.name}-redis" }
output "db_security_group_id" { value = "sg-db-stub" }
output "redis_security_group_id" { value = "sg-redis-stub" }
