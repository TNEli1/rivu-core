import { Request, Response } from 'express';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

// Initialize Plaid client
const plaidConfig = new Configuration({
  basePath: process.env.PLAID_ENV === 'production' 
    ? PlaidEnvironments.production 
    : process.env.PLAID_ENV === 'sandbox'
    ? PlaidEnvironments.sandbox
    : PlaidEnvironments.development,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_ENV === 'production' 
        ? process.env.PLAID_SECRET_PRODUCTION 
        : process.env.PLAID_SECRET_SANDBOX || process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(plaidConfig);

// Create Link Token for Plaid Link initialization
export const createLinkToken = async (req: Request, res: Response) => {
  try {
    console.log('Creating Plaid link token for user:', req.user?.id);
    
    // Validate environment variables
    if (!process.env.PLAID_CLIENT_ID) {
      console.error('PLAID_CLIENT_ID is missing');
      return res.status(500).json({ error: 'Bank connection not configured - missing client ID' });
    }
    
    const plaidSecret = process.env.PLAID_SECRET_PRODUCTION;
      
    if (!plaidSecret) {
      console.error('Plaid production secret is missing');
      return res.status(500).json({ error: 'Bank connection not configured - missing secret' });
    }

    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // CRITICAL: Set proper redirect URI for production OAuth banks that matches your Plaid dashboard
    const redirectUri = process.env.NODE_ENV === 'production' 
      ? 'https://tryrivu.com/plaid-callback'  // Must match exactly what's configured in Plaid dashboard
      : 'http://localhost:5000/plaid-callback';

    // Use correct production webhook URL
    const webhook = process.env.NODE_ENV === 'production'
      ? 'https://www.tryrivu.com/api/plaid/webhook'  // Use www subdomain for production
      : 'http://localhost:5000/api/plaid/webhook';

    console.log('Creating Plaid link token with redirect URI:', redirectUri);
    console.log('Creating Plaid link token with webhook URL:', webhook);

    const request = {
      user: {
        client_user_id: userId.toString(),
      },
      client_name: 'Rivu',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: redirectUri,
      webhook: webhook,
    };

    console.log('Plaid link token request:', { 
      ...request, 
      client_id: process.env.PLAID_CLIENT_ID,
      environment: process.env.PLAID_ENV 
    });

    const response = await plaidClient.linkTokenCreate(request);
    
    console.log('Plaid link token created successfully');
    return res.json({ 
      link_token: response.data.link_token,
      expiration: response.data.expiration,
      request_id: response.data.request_id
    });

  } catch (error: any) {
    console.error('Plaid link token creation error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      environment: process.env.PLAID_ENV,
      client_id: process.env.PLAID_CLIENT_ID ? 'present' : 'missing',
      secret: (process.env.PLAID_SECRET || process.env.PLAID_SECRET_SANDBOX || process.env.PLAID_SECRET_PRODUCTION) ? 'present' : 'missing'
    });

    const errorMessage = error.response?.data?.error_message || 'Unable to initialize bank connection';
    return res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Exchange Public Token for Access Token
export const exchangePublicToken = async (req: Request, res: Response) => {
  try {
    const { public_token, metadata, oauth_state_id } = req.body;
    const userId = req.user?.id;

    if (!public_token) {
      return res.status(400).json({ error: 'Public token is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('Exchanging public token for user:', userId, 'institution:', metadata?.institution?.name);
    
    // Log OAuth state if present for debugging
    if (oauth_state_id) {
      console.log('OAuth state ID provided:', oauth_state_id);
    }

    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const { access_token, item_id } = response.data;

    // Get institution info
    const institutionId = metadata?.institution?.institution_id;
    const institutionName = metadata?.institution?.name;

    // Store the Plaid item in database
    const { storage } = await import('../storage.ts');
    
    // Save Plaid item
    await storage.createPlaidItem({
      userId,
      itemId: item_id,
      accessToken: access_token,
      institutionId,
      institutionName,
      status: 'active'
    });

    // Get and store accounts
    const accountsResponse = await plaidClient.accountsGet({
      access_token,
    });

    const accounts = accountsResponse.data.accounts;
    console.log(`Retrieved ${accounts.length} accounts from Plaid`);

    // Store accounts in database
    for (const account of accounts) {
      await storage.createPlaidAccount({
        userId,
        plaidItemId: 0, // Will be updated with actual ID after item creation
        accountId: account.account_id,
        name: account.name,
        officialName: account.official_name || null,
        type: account.type,
        subtype: account.subtype || null,
        mask: account.mask || null,
        availableBalance: account.balances.available?.toString() || null,
        currentBalance: account.balances.current?.toString() || null,
        isoCurrencyCode: account.balances.iso_currency_code || null,
        status: 'active'
      });
    }

    console.log('Successfully connected bank account:', institutionName);

    return res.json({ 
      success: true, 
      item_id,
      accounts_count: accounts.length,
      institution_name: institutionName
    });

  } catch (error: any) {
    console.error('Public token exchange error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    const errorMessage = error.response?.data?.error_message || 'Failed to connect bank account';
    return res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get Connected Accounts
export const getConnectedAccounts = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { storage } = await import('../storage.ts');
    
    // Get user's Plaid items and accounts
    const plaidItems = await storage.getPlaidItemsByUserId(userId);
    const plaidAccounts = await storage.getPlaidAccountsByUserId(userId);

    return res.json({
      items: plaidItems,
      accounts: plaidAccounts
    });

  } catch (error: any) {
    console.error('Get connected accounts error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve connected accounts' });
  }
};

// Refresh Account Data
export const refreshAccountData = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { storage } = await import('../storage.ts');
    
    // Get the Plaid item
    const plaidItem = await storage.getPlaidItemById(parseInt(id));
    
    if (!plaidItem || plaidItem.userId !== userId) {
      return res.status(404).json({ error: 'Bank connection not found' });
    }

    // Refresh accounts data from Plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: plaidItem.accessToken,
    });

    const accounts = accountsResponse.data.accounts;

    // Update accounts in database
    for (const account of accounts) {
      await storage.updatePlaidAccount(account.account_id, {
        availableBalance: account.balances.available?.toString() || null,
        currentBalance: account.balances.current?.toString() || null,
        lastUpdated: new Date()
      });
    }

    return res.json({ 
      success: true, 
      accounts_updated: accounts.length,
      message: 'Account data refreshed successfully'
    });

  } catch (error: any) {
    console.error('Refresh account data error:', error.message);
    return res.status(500).json({ error: 'Failed to refresh account data' });
  }
};

// Disconnect Account
export const disconnectAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { storage } = await import('../storage.ts');
    
    // Get the Plaid item
    const plaidItem = await storage.getPlaidItemById(parseInt(id));
    
    if (!plaidItem || plaidItem.userId !== userId) {
      return res.status(404).json({ error: 'Bank connection not found' });
    }

    // Remove the item from Plaid
    await plaidClient.itemRemove({
      access_token: plaidItem.accessToken,
    });

    // Update status in database
    await storage.updatePlaidItemStatus(parseInt(id), 'disconnected');

    return res.json({ 
      success: true, 
      message: 'Bank account disconnected successfully'
    });

  } catch (error: any) {
    console.error('Disconnect account error:', error.message);
    return res.status(500).json({ error: 'Failed to disconnect bank account' });
  }
};