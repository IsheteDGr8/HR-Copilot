variable "resource_group_name" {
  type    = string
  default = "hr-copilot-rg"
}

variable "location" {
  type    = string
  default = "East US"
}

variable "prefix" {
  type    = string
  default = "hrcopilot"
}

variable "tenant_id" {
  type = string
  description = "Azure Tenant ID"
}

variable "sql_admin_username" {
  type    = string
  default = "sqladmin"
}

variable "sql_admin_password" {
  type      = string
  sensitive = true
}
