import React, { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Moon, Sun, ClipboardCheck, Info, MessageSquare, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OnboardingTutorial from "@/components/dashboard/OnboardingTutorial";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const { user, logoutMutation, updateDemographicsMutation, updateProfileMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [skipSurvey, setSkipSurvey] = useState(user?.demographics?.skipPermanently || false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [coachTone, setCoachTone] = useState<'encouraging' | 'direct' | 'strict'>(
    (user?.coachTone as 'encouraging' | 'direct' | 'strict') || 'encouraging'
  );
  const [activeTab, setActiveTab] = useState(() => {
    // Check if URL has tab parameter
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'appearance';
  });
  
  // Effect to update URL when tab changes
  useEffect(() => {
    if (window.history.pushState) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('tab', activeTab);
      window.history.pushState({ path: newUrl.toString() }, '', newUrl.toString());
    }
  }, [activeTab]);
  
  // Handle theme toggle
  const handleThemeToggle = () => {
    toggleTheme();
    toast({
      title: theme === 'dark' ? "Light Mode Enabled" : "Dark Mode Enabled",
      description: `You've switched to ${theme === 'dark' ? 'light' : 'dark'} mode.`,
    });
  };
  
  // Handle survey toggle
  const toggleSkipSurvey = () => {
    const newValue = !skipSurvey;
    setSkipSurvey(newValue);
    
    // Update user demographics
    updateDemographicsMutation.mutate({
      demographics: {
        skipPermanently: newValue,
        completed: user?.demographics?.completed || false,
      }
    }, {
      onSuccess: () => {
        toast({
          title: newValue ? "Survey disabled" : "Survey enabled",
          description: newValue 
            ? "You won't be prompted with the onboarding survey anymore." 
            : "You may see the onboarding survey on next login if not yet completed.",
        });
      },
      onError: () => {
        // Revert UI state on error
        setSkipSurvey(!newValue);
        toast({
          title: "Error updating preferences",
          description: "There was a problem saving your survey preferences.",
          variant: "destructive"
        });
      }
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar - Desktop only */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-grow md:ml-64 p-4 md:p-8 pb-20 md:pb-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account and application preferences</p>
        </div>

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="coaching">Coaching</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="privacy">Data & Privacy</TabsTrigger>
            <TabsTrigger value="rivu-score">Rivu Score™</TabsTrigger>
          </TabsList>
          
          <TabsContent value="appearance">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-6">Appearance</h2>
              
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  {theme === 'dark' ? (
                    <Moon className="h-5 w-5" />
                  ) : (
                    <Sun className="h-5 w-5" />
                  )}
                  <span>Dark Mode</span>
                </div>
                <Switch 
                  checked={theme === 'dark'} 
                  onCheckedChange={handleThemeToggle} 
                />
              </div>
              
              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-medium mb-4">Help & Tutorials</h3>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={() => setShowTutorial(true)}
                  >
                    <HelpCircle className="mr-2 h-4 w-4" />
                    View App Tutorial
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Re-launch the interactive tutorial to learn about Rivu's key features
                </p>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="coaching">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">AI Coach Preferences</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Coach Tone</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Choose how you'd like your AI financial coach to communicate with you
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroup 
                        value={coachTone} 
                        onValueChange={(value: 'encouraging' | 'direct' | 'strict') => {
                          setCoachTone(value);
                          // Update user profile with the new coach tone preference
                          updateProfileMutation.mutate({ coachTone: value }, {
                            onSuccess: () => {
                              toast({
                                title: "Coach tone updated",
                                description: "Your coach will now adapt their communication style.",
                              });
                            }
                          });
                        }}
                      >
                        <div className="flex items-center space-x-2 mb-2">
                          <RadioGroupItem value="encouraging" id="encouraging" />
                          <Label htmlFor="encouraging" className="font-medium">Encouraging</Label>
                        </div>
                        <p className="text-sm text-muted-foreground ml-6 mb-4">
                          Positive, supportive guidance that emphasizes your progress and achievements
                        </p>
                        
                        <div className="flex items-center space-x-2 mb-2">
                          <RadioGroupItem value="direct" id="direct" />
                          <Label htmlFor="direct" className="font-medium">Direct</Label>
                        </div>
                        <p className="text-sm text-muted-foreground ml-6 mb-4">
                          Clear, straightforward advice that focuses on practical steps and solutions
                        </p>
                        
                        <div className="flex items-center space-x-2 mb-2">
                          <RadioGroupItem value="strict" id="strict" />
                          <Label htmlFor="strict" className="font-medium">Strict</Label>
                        </div>
                        <p className="text-sm text-muted-foreground ml-6 mb-4">
                          More challenging guidance that holds you accountable to your financial goals
                        </p>
                      </RadioGroup>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="privacy">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Data & Privacy</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Your Data</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Rivu prioritizes your privacy. We only collect data that's necessary to provide you with our financial services.
                  </p>
                  
                  <div className="bg-primary/5 p-4 rounded-lg border mb-6">
                    <h4 className="font-medium mb-2">Data We Collect</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                      <li>Basic account information (name, email)</li>
                      <li>Financial information you choose to provide</li>
                      <li>Transaction data when you connect your bank accounts</li>
                      <li>Goals and budget settings you create</li>
                      <li>App usage to improve your experience</li>
                    </ul>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Data Deletion</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    You may request permanent deletion of your data at any time by emailing support@tryrivu.com or using the in-app "Delete My Data" feature below.
                  </p>
                  
                  <div className="space-y-3">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full">
                          Delete My Data
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete All Your Data</AlertDialogTitle>
                          <AlertDialogDescription className="space-y-2">
                            <p>This action will permanently delete:</p>
                            <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                              <li>Your account and profile information</li>
                              <li>All transaction data and bank connections</li>
                              <li>Budget categories and spending history</li>
                              <li>Savings goals and progress</li>
                              <li>Rivu Score history and insights</li>
                              <li>All AI coaching interactions</li>
                            </ul>
                            <p className="text-red-600 font-medium mt-3">
                              This action cannot be undone. Are you absolutely sure?
                            </p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            className="bg-red-600 hover:bg-red-700"
                            onClick={async () => {
                              try {
                                const response = await fetch('/api/user/data/all', {
                                  method: 'DELETE',
                                  credentials: 'include',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                });
                                
                                if (response.ok) {
                                  toast({
                                    title: "Data Deletion Initiated",
                                    description: "Your data deletion request has been processed. You will be logged out shortly.",
                                  });
                                  
                                  // Log out user after successful deletion
                                  setTimeout(() => {
                                    logoutMutation.mutate();
                                  }, 2000);
                                } else {
                                  throw new Error('Failed to delete data');
                                }
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to delete data. Please contact support@tryrivu.com",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            Yes, Delete Everything
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    
                    <p className="text-xs text-muted-foreground">
                      Alternatively, email support@tryrivu.com with "Data Deletion Request" as the subject.
                      We'll process your request within 30 days as required by CCPA and applicable privacy laws.
                    </p>
                  </div>
                </div>
                
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-medium mb-2">Security Practices</h3>
                  <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                    <li>All data is encrypted in transit and at rest</li>
                    <li>We never store your bank credentials</li>
                    <li>Regular security audits and testing</li>
                    <li>Bank connections are secured through Plaid's industry-leading protocols</li>
                  </ul>
                </div>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="rivu-score">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">How Your Rivu Score Works</h2>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-lg font-semibold mb-2">How Your Rivu Score Works</h2>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                  Your Rivu Score is a personal finance behavior score based on how consistently you stick to your budget, contribute to goals, and manage spending over time.
                </p>
                <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <li>Staying under budget improves your score</li>
                  <li>Consistent contributions toward goals help increase your score</li>
                  <li>Irregular spending or frequent overspending may reduce your score</li>
                </ul>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  Your score updates automatically and is meant to help you track your financial discipline — it's not a credit score or shared with anyone.
                </p>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="account">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-6">Account</h2>
            
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full mb-4 text-destructive border-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to sign out?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You will need to sign in again to access your account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogout}>
                      Sign Out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Last login: {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Unknown'}
                </p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
      
      {/* Tutorial Modal */}
      {showTutorial && (
        <OnboardingTutorial onClose={() => setShowTutorial(false)} />
      )}
    </div>
  );
}