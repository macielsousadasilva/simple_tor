import Tor from 'react-native-tor';

// Tipos básicos
export interface TorStatus {
  isReady: boolean;
  isInitializing: boolean;
  socksPort: number;
  reconnectAttempt: number;
}

// Estado global
let torInstance: any = null;
let statusCallbacks: ((status: TorStatus) => void)[] = [];
let isReady = false;
let isInitializing = false;
let socksPort = 0;
let reconnectAttempt = 0;
let isConnecting = false;

// Refs para controle
let connectionTimeout: NodeJS.Timeout | undefined;
let healthCheckInterval: NodeJS.Timeout | undefined;
let reconnectTimeout: NodeJS.Timeout | undefined;

// Inicializar Tor
const initializeTorInstance = () => {
  if (!torInstance) {
    torInstance = Tor({
      stopDaemonOnBackground: false,
      bootstrapTimeoutMs: 60000,
      clientTimeoutSeconds: 90,
    });
  }
  return torInstance;
};

// Funções internas
const getCurrentStatus = (): TorStatus => ({ isReady, isInitializing, socksPort, reconnectAttempt });
const notifyStatusChange = (): void => statusCallbacks.forEach(cb => cb(getCurrentStatus()));

// Verificar se status indica conexão ativa
const isStatusConnected = (status: string): boolean => {
  const cleanStatus = status.replace(/"/g, '').trim().toUpperCase();
  const connectedStatuses = ['DONE', 'READY', 'CONNECTED'];
  console.log(`🔍 Status limpo: "${cleanStatus}" - Conectado: ${connectedStatuses.includes(cleanStatus)}`);
  return connectedStatuses.includes(cleanStatus);
};

// Conectar ao Tor
const connectToTor = async (attempt = 1): Promise<void> => {
  if (isConnecting) return;
  
  const tor = initializeTorInstance();
  
  isConnecting = true;
  isInitializing = true;
  reconnectAttempt = attempt;
  notifyStatusChange();
  
  console.log(`🚀 Tentativa ${attempt} - Iniciando Tor...`);
  
  try {
    if (connectionTimeout) clearTimeout(connectionTimeout);
    
    const timeoutPromise = new Promise((_, reject) => {
      connectionTimeout = setTimeout(() => {
        reject(new Error('Timeout de 20 segundos'));
      }, 20000);
    });
    
    const connectPromise = tor.startIfNotStarted();
    const port = await Promise.race([connectPromise, timeoutPromise]);
    
    if (connectionTimeout) clearTimeout(connectionTimeout);
    
    console.log(`✅ Tor conectado na porta: ${port}`);
    socksPort = port;
    isReady = true;
    isInitializing = false;
    isConnecting = false;
    reconnectAttempt = 0;
    
    notifyStatusChange();
    startHealthCheck();
    
  } catch (error) {
    console.error(`❌ Tentativa ${attempt} falhou:`, error);
    isConnecting = false;
    isInitializing = false;
    notifyStatusChange();
    
    reconnectTimeout = setTimeout(() => {
      connectToTor(attempt + 1);
    }, 3000);
  }
};

// Monitoramento de saúde
const startHealthCheck = (): void => {
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  
  const tor = initializeTorInstance();
  
  healthCheckInterval = setInterval(async () => {
    try {
      const rawStatus = await tor.getDaemonStatus();
      console.log(`🔍 Health check - Status bruto: ${JSON.stringify(rawStatus)}`);
      
      const statusConnected = isStatusConnected(rawStatus);
      
      if (!statusConnected && isReady) {
        console.log(`🚨 Conexão perdida! Status: ${rawStatus}`);
        isReady = false;
        notifyStatusChange();
        
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        setTimeout(() => connectToTor(1), 10000);
      } 
      else if (statusConnected && !isReady) {
        console.log(`✅ Tor está conectado mas estado estava incorreto`);
        isReady = true;
        notifyStatusChange();
      }
      else if (statusConnected && isReady) {
        console.log(`✅ Health check OK - Tor conectado`);
      }
      
    } catch (error) {
      console.error('⚠️ Erro no health check:', error);
      
      if (isReady) {
        console.log('🚨 Erro ao verificar status, considerando desconectado');
        isReady = false;
        notifyStatusChange();
        
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        setTimeout(() => connectToTor(1), 10000);
      }
    }
  }, 15000);
};

// ✅ FUNÇÃO PRINCIPAL SIMPLIFICADA
export const makeRequest = async (
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  options?: {
    headers?: Record<string, string>;
    body?: string;
  }
) => {
  // Garantir conexão
  if (!isReady) {
    await ensureConnection();
  }
  
  if (!isReady) {
    throw new Error('Tor não está conectado');
  }

  const tor = initializeTorInstance();
  console.log(`📡 ${method} para: ${url}`);
  
  const headers = options?.headers || {};
  const body = options?.body || '';
  
  try {
    let result;
    
    switch (method) {
      case 'GET':
        result = await tor.get(url, headers, true);
        break;
      case 'POST':
        result = await tor.post(url, body, headers, true);
        break;
      case 'PUT':
        result = await tor.post(url, body, { ...headers, 'X-HTTP-Method-Override': 'PUT' }, true);
        break;
      case 'DELETE':
        result = await tor.delete(url, body, headers, true);
        break;
    }
    
    console.log(`✅ Requisição ${method} concluída`);
    return result;
  } catch (error) {
    console.error(`❌ Erro na requisição ${method}:`, error);
    throw error;
  }
};

// Funções auxiliares simplificadas
export const get = (url: string, headers?: Record<string, string>) => 
  makeRequest(url, 'GET', { headers });

export const post = (url: string, body: string, headers?: Record<string, string>) => 
  makeRequest(url, 'POST', { headers, body });

export const put = (url: string, body: string, headers?: Record<string, string>) => 
  makeRequest(url, 'PUT', { headers, body });

export const del = (url: string, body?: string, headers?: Record<string, string>) => 
  makeRequest(url, 'DELETE', { headers, body });

// Funções de controle
export const initializeTor = async (): Promise<void> => {
  console.log('🏁 Inicializando TorService...');
  await connectToTor(1);
};

export const ensureConnection = async (): Promise<boolean> => {
  if (isReady) {
    console.log('✅ Tor já está conectado');
    return true;
  }
  
  if (isConnecting) {
    console.log('⏳ Tor já está tentando conectar...');
    return false;
  }
  
  console.log('🔄 Tor não está conectado, iniciando conexão...');
  await connectToTor(1);
  return isReady;
};

export const onStatusChange = (callback: (status: TorStatus) => void): (() => void) => {
  statusCallbacks.push(callback);
  callback(getCurrentStatus());
  return () => {
    const index = statusCallbacks.indexOf(callback);
    if (index > -1) statusCallbacks.splice(index, 1);
  };
};

export const reconnect = async (): Promise<void> => {
  console.log('🔄 Reconexão manual solicitada');
  
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  
  isReady = false;
  isConnecting = false;
  
  await connectToTor(1);
};

export const getStatus = (): TorStatus => getCurrentStatus();
export const isReady_func = (): boolean => isReady;
export const getSocksPort = (): number => socksPort;

export const stopHealthCheck = (): void => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    console.log('🛑 Health check parado');
  }
};

export const cleanup = (): void => {
  console.log('🧹 Limpando recursos do TorService...');
  
  if (connectionTimeout) clearTimeout(connectionTimeout);
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  
  if (torInstance) {
    torInstance.stopIfRunning().catch(console.error);
  }
  
  statusCallbacks = [];
  isReady = false;
  isInitializing = false;
  socksPort = 0;
  reconnectAttempt = 0;
  isConnecting = false;
};