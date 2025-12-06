import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import { showSuccess } from '@/components/ui/toast-helpers';
import { APIKeyManagement } from '@/components/settings/APIKeyManagement';
import { 
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  Download,
  Upload,
  Database,
  Activity,
  Code,
  Github
} from 'lucide-react';

const settingsCategories = [
  {
    title: 'Account',
    icon: User,
    settings: [
      { label: 'Profile Information', description: 'Update your profile and preferences' },
      { label: 'Password & Security', description: 'Change password and security settings' },
      { label: 'Notifications', description: 'Email and push notification preferences' },
    ]
  },
  {
    title: 'Application',
    icon: SettingsIcon,
    settings: [
      { label: 'Theme & Appearance', description: 'Customize the look and feel' },
      { label: 'Language & Region', description: 'Language and regional settings' },
      { label: 'Data & Storage', description: 'Manage your local data and cache' },
    ]
  },
  {
    title: 'Advanced',
    icon: Code,
    settings: [
      { label: 'Developer Tools', description: 'API access and debugging tools' },
      { label: 'Export Data', description: 'Download your collection and decks' },
      { label: 'Import Data', description: 'Import from other platforms' },
    ]
  }
];

const buildInfo = {
  version: '2.1.0',
  buildDate: '2024-08-28',
  commit: 'a1b2c3d',
  environment: 'production'
};

export default function Settings() {
  const [selectedCategory, setSelectedCategory] = useState('Account');

  const handleSettingClick = (setting: string) => {
    showSuccess("Settings", `Opening ${setting} settings`);
  };

  const handleExportData = () => {
    showSuccess("Export Started", "Your data export will be ready shortly");
  };

  const handleImportData = () => {
    showSuccess("Import Ready", "Select your data file to import");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 md:px-6 py-4 md:py-6">
        <StandardSectionHeader
          title="Settings"
          description="Manage your account, preferences, and application settings"
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Settings Navigation */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {settingsCategories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <Button
                      key={category.title}
                      variant={selectedCategory === category.title ? 'default' : 'ghost'}
                      className="w-full justify-start"
                      onClick={() => setSelectedCategory(category.title)}
                    >
                      <Icon className="h-4 w-4 mr-3" />
                      {category.title}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Build Information */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  Build Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Version</span>
                  <Badge variant="outline">{buildInfo.version}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Build Date</span>
                  <span>{buildInfo.buildDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Commit</span>
                  <code className="text-xs bg-muted px-1 rounded">{buildInfo.commit}</code>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Environment</span>
                  <Badge variant={buildInfo.environment === 'production' ? 'default' : 'secondary'}>
                    {buildInfo.environment}
                  </Badge>
                </div>
                <Separator />
                <Button variant="outline" size="sm" className="w-full">
                  <Github className="h-4 w-4 mr-2" />
                  View on GitHub
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{selectedCategory} Settings</CardTitle>
              </CardHeader>
              <CardContent>
                {settingsCategories
                  .find(cat => cat.title === selectedCategory)
                  ?.settings.map((setting, index) => (
                    <div key={index} className="py-4 border-b border-border last:border-b-0">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{setting.label}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {setting.description}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSettingClick(setting.label)}
                        >
                          Configure
                        </Button>
                      </div>
                    </div>
                  ))}

                {/* Special Actions for Advanced Category */}
                {selectedCategory === 'Advanced' && (
                  <div className="mt-6 pt-6 border-t border-border space-y-6">
                    {/* API Key Management */}
                    <div>
                      <h4 className="font-medium mb-4">API Keys</h4>
                      <APIKeyManagement />
                    </div>

                    {/* Data Management */}
                    <div>
                      <h4 className="font-medium mb-4">Data Management</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                          <CardContent className="p-4 text-center">
                            <Download className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <h5 className="font-medium mb-1">Export Data</h5>
                            <p className="text-xs text-muted-foreground mb-3">
                              Download your collection and deck data
                            </p>
                            <Button size="sm" onClick={handleExportData}>
                              <Download className="h-4 w-4 mr-2" />
                              Export
                            </Button>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardContent className="p-4 text-center">
                            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <h5 className="font-medium mb-1">Import Data</h5>
                            <p className="text-xs text-muted-foreground mb-3">
                              Import from other MTG platforms
                            </p>
                            <Button size="sm" variant="outline" onClick={handleImportData}>
                              <Upload className="h-4 w-4 mr-2" />
                              Import
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}