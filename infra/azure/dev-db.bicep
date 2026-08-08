@description('Environment name')
param environment string = 'dev'

@description('Azure region for PostgreSQL')
param location string = 'centralindia'

@description('Project name prefix')
param projectName string = 'bahikhata'

@description('PostgreSQL admin user')
param pgAdminUser string = 'bahikhataadmin'

@secure()
@description('PostgreSQL admin password')
param pgAdminPassword string

var pgName = '${projectName}-${environment}-pg'

// PostgreSQL Flexible Server - Burstable Tier (Most Cost-Effective)
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: pgName
  location: location
  sku: {
    name: 'Standard_B1ms'  // Burstable B1ms - most cost-effective option
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    version: '15'  // Latest stable version
    storage: {
      storageSizeGB: 32  // Minimum storage
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    createMode: 'Default'
  }
}

// Database
resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  parent: postgres
  name: 'bahi_khata_dev'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Firewall rule to allow Azure services
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Firewall rule to allow all IPs (for Vercel serverless functions)
// Note: In production, restrict this to specific Vercel IP ranges
resource pgFirewallAll 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: postgres
  name: 'AllowVercel'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

// Outputs
output pgHost string = postgres.properties.fullyQualifiedDomainName
output pgName string = postgres.name
output pgDatabaseName string = pgDatabase.name
output pgAdminUser string = pgAdminUser
output connectionString string = 'postgresql://${pgAdminUser}:@${postgres.properties.fullyQualifiedDomainName}:5432/${pgDatabase.name}?sslmode=require'
