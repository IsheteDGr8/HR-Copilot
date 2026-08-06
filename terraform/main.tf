terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

# Key Vault
resource "azurerm_key_vault" "kv" {
  name                        = "${var.prefix}-kv"
  location                    = azurerm_resource_group.rg.location
  resource_group_name         = azurerm_resource_group.rg.name
  tenant_id                   = var.tenant_id
  sku_name                    = "standard"
  purge_protection_enabled    = false
}

# Azure OpenAI
resource "azurerm_cognitive_account" "openai" {
  name                = "${var.prefix}-openai"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  kind                = "OpenAI"
  sku_name            = "S0"
}

# Azure AI Search
resource "azurerm_search_service" "search" {
  name                = "${var.prefix}-search"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "standard"
}

# Azure SQL Server
resource "azurerm_mssql_server" "sql_server" {
  name                         = "${var.prefix}-sqlserver"
  resource_group_name          = azurerm_resource_group.rg.name
  location                     = azurerm_resource_group.rg.location
  version                      = "12.0"
  administrator_login          = var.sql_admin_username
  administrator_login_password = var.sql_admin_password
}

# Azure SQL Database
resource "azurerm_mssql_database" "sqldb" {
  name      = "${var.prefix}-sqldb"
  server_id = azurerm_mssql_server.sql_server.id
  sku_name  = "S0"
}

# App Service Plan (for FastAPI backend)
resource "azurerm_service_plan" "app_plan" {
  name                = "${var.prefix}-app-plan"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1"
}

# Linux Web App for FastAPI Backend
resource "azurerm_linux_web_app" "backend" {
  name                = "${var.prefix}-api"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_service_plan.app_plan.location
  service_plan_id     = azurerm_service_plan.app_plan.id

  site_config {
    application_stack {
      python_version = "3.11"
    }
  }

  app_settings = {
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE" = "false"
    "AZURE_OPENAI_ENDPOINT"               = azurerm_cognitive_account.openai.endpoint
    "AZURE_SEARCH_ENDPOINT"               = "https://${azurerm_search_service.search.name}.search.windows.net"
    "USE_MOCK_AZURE"                      = "true" # Default to mock for initial dev
  }
}
