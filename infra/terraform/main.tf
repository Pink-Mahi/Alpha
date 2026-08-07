# Terraform — M0 infra skeleton.
#
# ⚠️ NOT applied. Run `terraform init && terraform plan` only after installing
# Terraform and configuring AWS credentials. Review PHASE2_DESIGN.md §11 (M0)
# before applying. All values via variables; nothing hard-coded.

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
  backend "s3" {
    # Configure before init: bucket + region + key.
    # bucket = "cascade-tfstate"
    # key    = "m0/terraform.tfstate"
    # region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# --- Networking -------------------------------------------------------------

module "vpc" {
  source = "./modules/vpc"
  name   = "cascade-${var.env}"
  region = var.aws_region
  cidr   = "10.0.0.0/16"
}

# --- Data plane -------------------------------------------------------------

resource "aws_eks_cluster" "control" {
  name     = "cascade-${var.env}"
  role_arn = aws_iam_role.eks_cluster.arn
  vpc_config {
    subnet_ids = module.vpc.private_subnet_ids
  }
}

resource "aws_iam_role" "eks_cluster" {
  name = "cascade-eks-cluster-${var.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
    }]
  })
}

resource "aws_db_instance" "postgres" {
  identifier        = "cascade-pg-${var.env}"
  engine            = "postgres"
  engine_version    = "16.2"
  instance_class    = "db.t4g.small"
  allocated_storage = 20
  db_name           = "cascade"
  username          = "postgres"
  password          = var.db_password
  db_subnet_group_name   = module.vpc.db_subnet_group_name
  vpc_security_group_ids = [module.vpc.db_security_group_id]
  storage_encrypted      = true
  skip_final_snapshot    = true
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "cascade-redis-${var.env}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  subnet_group_name    = module.vpc.elasticache_subnet_group_name
  security_group_ids   = [module.vpc.redis_security_group_id]
}

resource "aws_kms_key" "tenant" {
  description             = "Cascade per-tenant data key wrapper (${var.env})"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

# --- Variables --------------------------------------------------------------

variable "env" {
  type    = string
  default = "dev"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "db_password" {
  type      = string
  sensitive = true
}

output "eks_cluster_name" { value = aws_eks_cluster.control.name }
output "postgres_endpoint" { value = aws_db_instance.postgres.endpoint }
output "redis_endpoint" { value = aws_elasticache_cluster.redis.cache_nodes[0].address }
output "kms_key_arn" { value = aws_kms_key.tenant.arn }
