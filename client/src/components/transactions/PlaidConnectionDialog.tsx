import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, ExternalLink, Building, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnExit } from 'react-plaid-link';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface PlaidConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlaidConnectionDialog({ isOpen, onClose }: PlaidConnectionDialogProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPlaidKeys, setHasPlaidKeys] = useState(true);
  const [plaidLinkOpen, setPlaidLinkOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Clean up URL on component mount to remove stale OAuth parameters
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('oauth_state_id')) {
      // Remove OAuth parameters from URL to prevent interference with new connections
      currentUrl.searchParams.delete('oauth_state_id');
      window.history.replaceState({}, '', currentUrl.toString());
      console.log('Cleaned up stale OAuth parameters from URL');
    }
  }, []);

  // Get a link token from our API when the dialog opens
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setSuccess(false);
      setLinkToken(null); // Reset link token to ensure fresh state
      
      // Clear any stale OAuth data to ensure fresh OAuth flows
      localStorage.removeItem('plaid_link_success');
      
      const fetchLinkToken = async () => {
        try {
          console.log('Verifying bank connection service...');
          
          // First verify if Plaid keys are configured
          const configResponse = await fetch('/api/plaid/status', {
            method: 'GET',
            credentials: 'include'
          });
          
          if (!configResponse.ok) {
            if (configResponse.status === 503) {
              setHasPlaidKeys(false);
              throw new Error('Bank connection service is not configured');
            }
          }
          
          // Make a simple GET request to ensure session is valid
          const userResponse = await fetch('/api/user', {
            credentials: 'include'
          });
          
          if (!userResponse.ok) {
            throw new Error('Your session has expired. Please log in again.');
          }

          console.log('Requesting fresh Plaid link token...');
          
          // CRITICAL: Store the link token immediately when received for OAuth flows
          const storeTokenForOAuth = (token: string) => {
            // Store in both localStorage and sessionStorage for maximum persistence
            localStorage.setItem('plaid_link_token', token);
            sessionStorage.setItem('plaid_link_token', token);
            localStorage.setItem('plaid_link_config', JSON.stringify({
              timestamp: Date.now(),
              token: token.substring(0, 20) + '...',
              redirectUri: `${window.location.origin}/plaid-callback`
            }));
            console.log('Stored link token for potential OAuth redirect with URI:', `${window.location.origin}/plaid-callback`);
          };
          
          // Make the actual request for the link token
          const response = await fetch('/api/plaid/create_link_token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include',
            body: JSON.stringify({}) // Empty request body
          });
          
          // Handle response status
          if (!response.ok) {
            // Try to parse error message from response
            let errorMessage = 'Unable to initialize bank connection';
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } catch (e) {
              // If JSON parsing fails, use text content if available
              try {
                errorMessage = await response.text() || errorMessage;
              } catch (textError) {
                // If text extraction fails, use status code
                errorMessage = `Service error (${response.status})`;
              }
            }
            throw new Error(errorMessage);
          }
          
          // Parse the successful response
          const data = await response.json();
          
          if (data && data.link_token) {
            console.log('Successfully received fresh link token');
            
            // CRITICAL: Store token immediately for OAuth flows
            storeTokenForOAuth(data.link_token);
            
            setLinkToken(data.link_token);
          } else {
            setError('Cannot connect to banking service');
            console.error('Missing link token in response:', data);
          }
        } catch (err: any) {
          console.error('Error in bank connection setup:', err);
          setError(err.message || 'Unable to connect to banking services');
        } finally {
          setLoading(false);
        }
      };
      
      fetchLinkToken();
    }
    // Note: Don't clear linkToken immediately when dialog closes
    // to avoid interrupting Plaid initialization
  }, [isOpen]);

  // Handle the success callback from Plaid Link
  const onSuccess: PlaidLinkOnSuccess = useCallback(async (public_token, metadata) => {
    setLoading(true);
    setPlaidLinkOpen(false); // Plaid Link has completed, close it
    
    try {
      console.log('Plaid Link success with metadata:', 
        metadata ? JSON.stringify({
          institution_id: metadata.institution?.institution_id,
          link_session_id: metadata.link_session_id,
          accounts_connected: metadata.accounts?.length || 0
        }) : 'No metadata'
      );
      
      // For non-OAuth flows, we can immediately exchange the token
      // OAuth flows will handle token exchange in the callback page
      
      // Exchange the public token for an access token
      const response = await apiRequest('POST', '/api/plaid/exchange_token', {
        public_token,
        metadata
      });
      
      const data = await response.json();
      
      if (data && data.success) {
        // Get bank name if available, otherwise use a generic label
        const bankName = metadata?.institution?.name || 'your bank';
        console.log(`Plaid Link successful - Connected to: ${bankName}`);
        
        // Get accounts for the connected bank
        const accountsResponse = await apiRequest('POST', '/api/plaid/accounts', {});
        
        // Invalidate any cached account data
        queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
        
        // Show success state
        setSuccess(true);
        toast({
          title: "Success!",
          description: `Connected to ${bankName}`
        });
        
        // Close the dialog after a short delay
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        throw new Error((data && data.error) || 'Failed to exchange token');
      }
    } catch (err: any) {
      console.error('Error exchanging token:', err);
      setError(err.message || 'Failed to connect bank account');
      toast({
        title: "Connection Failed",
        description: err.message || 'Failed to connect bank account',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [onClose, queryClient, toast]);

  // Handle any errors from Plaid Link
  const onExit: PlaidLinkOnExit = useCallback((err) => {
    setPlaidLinkOpen(false); // Plaid Link has closed, whether successful or not
    
    if (err) {
      console.error('Plaid Link error:', err);
      setError(err.error_message || 'Error connecting to bank');
    }
    
    // Clean up link token after Plaid exits cleanly
    setTimeout(() => {
      setLinkToken(null);
      console.log('Cleaned up link token after Plaid exit');
    }, 1000);
  }, []);

  // Use environment-appropriate redirect URI for OAuth banks - must match backend and Plaid dashboard
  // Get the current window location to ensure redirect URI matches actual deployment
  const currentHost = window.location.origin;
  const oauthRedirectUri = `${currentHost}/plaid-callback`;

  // CRITICAL FIX: Only configure usePlaidLink when link token is available
  const config = linkToken
    ? {
        token: linkToken,
        onSuccess,
        onExit,
        oauthRedirectUri,
      }
    : null;

  const { open, ready } = usePlaidLink(config ?? { token: '', onSuccess, onExit }); // fallback is inert
  
  // Debug effect to track link token updates
  useEffect(() => {
    console.log("🔑 Link token updated:", linkToken);
  }, [linkToken]);

  // Trigger Plaid Link when button is clicked
  const handlePlaidLinkClick = useCallback(() => {
    // Reset any previous errors before attempting to open
    setError(null);
    
    // CRITICAL FIX: Guard against empty or missing link token
    if (!linkToken) {
      setError('Link token is missing. Please try again later.');
      return;
    }
    if (!ready) {
      setError('Plaid is still initializing. Try again in a moment.');
      return;
    }
    
    // Set Plaid Link as open to hide the outer modal
    setPlaidLinkOpen(true);
    
    // Everything is ready, open the Plaid Link
    console.log('Opening Plaid Link with valid token:', linkToken.substring(0, 10) + '...');
    open();
  }, [ready, linkToken, open]);

  return (
    <Dialog open={isOpen && !plaidLinkOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md mx-auto w-[92%] md:w-[480px] max-h-[85vh] flex flex-col">
        <DialogHeader className="px-2">
          <DialogTitle>Connect Bank Account</DialogTitle>
          <DialogDescription className="break-words">
            Securely connect your bank accounts to automatically import transactions.
          </DialogDescription>
        </DialogHeader>
        
        {/* Main content - scrollable */}
        <div className="py-4 overflow-y-auto flex-1 px-2">
          {error && (
            <Alert className="mb-4" variant="destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription className="break-words whitespace-normal">{error}</AlertDescription>
            </Alert>
          )}
          
          {success ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Connected Successfully!</h3>
              <p className="text-muted-foreground break-words">
                Your accounts have been connected. Transactions will begin syncing shortly.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-5">
                <p className="text-sm">
                  Connect your bank accounts to Rivu to:
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  <li>Automatically import transactions</li>
                  <li>Keep your transaction data up-to-date</li>
                  <li>Track spending across all your accounts</li>
                  <li>Get personalized insights</li>
                </ul>
              </div>
              
              <div className="bg-muted p-4 rounded-md mb-4">
                <h4 className="font-medium mb-2">Security & Privacy</h4>
                <p className="text-sm text-muted-foreground break-words whitespace-normal">
                  Your credentials are never stored on our servers. We use Plaid's secure services
                  to connect to your financial institutions.
                </p>
              </div>
            </>
          )}
        </div>
        
        {/* Footer - fixed at bottom of dialog */}
        <DialogFooter className="flex flex-col mt-auto border-t pt-4">
          {/* Privacy link */}
          <Button 
            variant="link"
            className="text-xs mb-3 w-full justify-start px-0 h-auto"
            onClick={() => {
              window.open('https://plaid.com/how-we-handle-data/', '_blank');
            }}
          >
            How is my data protected? <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
          
          {/* Action buttons */}
          <div className="flex justify-end gap-2 w-full flex-wrap">
            <Button 
              onClick={onClose} 
              variant="outline" 
              size="sm"
              className="min-w-[80px]"
            >
              {success ? 'Close' : 'Cancel'}
            </Button>
            
            {!success && (
              <Button 
                size="sm"
                className="gap-1 min-w-[120px]"
                disabled={!ready || loading || !linkToken}
                onClick={handlePlaidLinkClick}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Building className="h-4 w-4 flex-shrink-0" /> 
                    <span>Connect Bank</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}