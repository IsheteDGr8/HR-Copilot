output "backend_url" {
  value = azurerm_linux_web_app.backend.default_hostname
}

output "openai_endpoint" {
  value = azurerm_cognitive_account.openai.endpoint
}

output "search_endpoint" {
  value = "https://${azurerm_search_service.search.name}.search.windows.net"
}
