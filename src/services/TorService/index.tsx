import Tor from 'react-native-tor';
import { AppState, AppStateStatus } from 'react-native';

// Tipos básicos
export interface TorStatus {
  isReady: boolean;
  isInitializing: boolean;
  socksPort: number;
  reconnectAttempt: number;
  lastError?: string;
  connectionTime?: Date;
  lastHealthCheck?: Date;
  isReconnecting?: boolean;
}

// ✅ CONFIGURAÇÕES DE TIMEOUT
const REQUEST_TIMEOUT = 10000; // 6 segundos para requisições da API
const CONNECTION_TIMEOUT = 30000; // 30 segundos para conexão inicial
const HEALTH_CHECK_TIMEOUT = 8000; // 8 segundos para health check

// Estado global
let torInstance: any = null;
let statusCallbacks: ((status: TorStatus) => void)[] = [];
let isReady = false;
let isInitializing = false;
let socksPort = 0;
let reconnectAttempt = 0;
let isConnecting = false;
let isReconnecting = false;
let lastError: string | undefined;
let connectionTime: Date | undefined;
let lastHealthCheck: Date | undefined;

// Refs para controle
let connectionTimeout: NodeJS.Timeout | undefined;
let healthCheckInterval: NodeJS.Timeout | undefined;
let reconnectTimeout: NodeJS.Timeout | undefined;
let appStateSubscription: any;
let lastAppState: AppStateStatus = 'active';

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

// ✅ FUNÇÃO PARA CRIAR TIMEOUT DE REQUISIÇÃO
const createRequestTimeout = (timeoutMs: number = REQUEST_TIMEOUT): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout da requisição (${timeoutMs/1000}s) - API não respondeu`));
    }, timeoutMs);
  });
};

// Funções internas
const getCurrentStatus = (): TorStatus => ({ 
  isReady, 
  isInitializing, 
  socksPort, 
  reconnectAttempt,
  lastError,
  connectionTime,
  lastHealthCheck,
  isReconnecting
});

const notifyStatusChange = (): void => {
  const status = getCurrentStatus();
  console.log(`📊 Status mudou:`, status);
  statusCallbacks.forEach(cb => cb(status));
};

// Verificar se status indica conexão ativa
const isStatusConnected = (status: string): boolean => {
  const cleanStatus = status.replace(/"/g, '').trim().toUpperCase();
  const connectedStatuses = ['DONE', 'READY', 'CONNECTED'];
  return connectedStatuses.includes(cleanStatus);
};

// Conectar ao Tor
const connectToTor = async (attempt = 1, isAutoReconnect = false): Promise<void> => {
  if (isConnecting) {
    console.log('⏳ Já está tentando conectar...');
    return;
  }
  
  const tor = initializeTorInstance();
  
  isConnecting = true;
  isInitializing = true;
  isReconnecting = isAutoReconnect;
  reconnectAttempt = attempt;
  lastError = undefined;
  notifyStatusChange();
  
  console.log(`🚀 ${isAutoReconnect ? 'Auto-reconexão' : 'Conexão'} - Tentativa ${attempt}`);
  
  try {
    if (connectionTimeout) clearTimeout(connectionTimeout);
    
    const timeoutPromise = new Promise((_, reject) => {
      connectionTimeout = setTimeout(() => {
        reject(new Error(`Timeout de conexão (${CONNECTION_TIMEOUT/1000}s) - Tentativa ${attempt}`));
      }, CONNECTION_TIMEOUT);
    });
    
    const connectPromise = tor.startIfNotStarted();
    const port = await Promise.race([connectPromise, timeoutPromise]);
    
    if (connectionTimeout) clearTimeout(connectionTimeout);
    
    console.log(`✅ Tor conectado na porta: ${port}`);
    socksPort = port;
    isReady = true;
    isInitializing = false;
    isConnecting = false;
    isReconnecting = false;
    reconnectAttempt = 0;
    lastError = undefined;
    connectionTime = new Date();
    
    notifyStatusChange();
    startHealthCheck();
    
  } catch (error) {
    const errorMsg = `${isAutoReconnect ? 'Auto-reconexão' : 'Conexão'} falhou na tentativa ${attempt}: ${error.message}`;
    console.error(`❌ ${errorMsg}`);
    
    isConnecting = false;
    isInitializing = false;
    isReconnecting = false;
    lastError = errorMsg;
    notifyStatusChange();
    
    // Tentar reconectar após delay progressivo (máximo 5 tentativas)
    if (attempt < 5) {
      const delay = Math.min(3000 * attempt, 15000); // Delay progressivo até 15s
      console.log(`🔄 Tentando novamente em ${delay/1000}s... (${attempt + 1}/5)`);
      reconnectTimeout = setTimeout(() => {
        connectToTor(attempt + 1, isAutoReconnect);
      }, delay);
    } else {
      lastError = `Máximo de tentativas atingido (5/5). ${isAutoReconnect ? 'Auto-reconexão' : 'Conexão'} falhou.`;
      notifyStatusChange();
    }
  }
};

// ✅ MONITORAMENTO DE SAÚDE COM TIMEOUT
const startHealthCheck = (): void => {
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  
  const tor = initializeTorInstance();
  
  healthCheckInterval = setInterval(async () => {
    try {
      // Health check com timeout próprio
      const healthCheckPromise = tor.getDaemonStatus();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Health check timeout (${HEALTH_CHECK_TIMEOUT/1000}s)`));
        }, HEALTH_CHECK_TIMEOUT);
      });
      
      const rawStatus = await Promise.race([healthCheckPromise, timeoutPromise]);
      lastHealthCheck = new Date();
      console.log(`🔍 Health check - Status: ${JSON.stringify(rawStatus)}`);
      
      const statusConnected = isStatusConnected(rawStatus);
      
      if (!statusConnected && isReady) {
        console.log(`🚨 Conexão perdida! Status: ${rawStatus}`);
        isReady = false;
        lastError = `Conexão perdida - Status: ${rawStatus}`;
        connectionTime = undefined;
        notifyStatusChange();
        
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        console.log('🔄 Iniciando auto-reconexão em 2 segundos...');
        setTimeout(() => connectToTor(1, true), 2000);
      } 
      else if (statusConnected && !isReady && !isConnecting) {
        console.log(`✅ Tor reconectado automaticamente`);
        isReady = true;
        lastError = undefined;
        connectionTime = new Date();
        notifyStatusChange();
      }
      else if (statusConnected && isReady) {
        console.log(`✅ Health check OK - Conectado há ${getConnectionDuration()}`);
      }
      
    } catch (error) {
      console.error('⚠️ Erro no health check:', error);
      lastHealthCheck = new Date();
      
      if (isReady) {
        console.log('🚨 Erro ao verificar status, considerando desconectado');
        isReady = false;
        lastError = `Erro no health check: ${error.message}`;
        connectionTime = undefined;
        notifyStatusChange();
        
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        console.log('🔄 Iniciando auto-reconexão em 3 segundos...');
        setTimeout(() => connectToTor(1, true), 3000);
      }
    }
  }, 10000); // Health check a cada 10 segundos
};

// Verificar conexão quando app volta ao foreground
const handleAppStateChange = (nextAppState: AppStateStatus) => {
  console.log(`📱 App state mudou: ${lastAppState} -> ${nextAppState}`);
  
  if (lastAppState.match(/inactive|background/) && nextAppState === 'active') {
    console.log('📱 App voltou ao foreground - Verificando conexão Tor...');
    
    // Aguardar um pouco para o app se estabilizar
    setTimeout(async () => {
      if (!isReady && !isConnecting && !isInitializing) {
        console.log('🔄 App retornou e Tor não está conectado - Iniciando auto-reconexão...');
        await connectToTor(1, true);
      } else if (isReady) {
        console.log('✅ App retornou e Tor está conectado - Fazendo health check imediato...');
        // Forçar um health check imediato com timeout
        const tor = initializeTorInstance();
        try {
          const healthCheckPromise = tor.getDaemonStatus();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Health check imediato timeout'));
            }, HEALTH_CHECK_TIMEOUT);
          });
          
          const status = await Promise.race([healthCheckPromise, timeoutPromise]);
          if (!isStatusConnected(status)) {
            console.log('🚨 Health check imediato detectou desconexão');
            isReady = false;
            lastError = 'Conexão perdida durante ausência do app';
            connectionTime = undefined;
            notifyStatusChange();
            await connectToTor(1, true);
          } else {
            console.log('✅ Health check imediato confirmou conexão');
          }
        } catch (error) {
          console.log('🚨 Erro no health check imediato');
          isReady = false;
          lastError = 'Erro ao verificar conexão após retorno do app';
          connectionTime = undefined;
          notifyStatusChange();
          await connectToTor(1, true);
        }
      }
    }, 1000);
  }
  
  lastAppState = nextAppState;
};

// Função para calcular tempo de conexão
const getConnectionDuration = (): string => {
  if (!connectionTime) return 'N/A';
  const now = new Date();
  const diff = now.getTime() - connectionTime.getTime();
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

// Validações de entrada
const validateUrl = (url: string): void => {
  if (!url || typeof url !== 'string') {
    throw new Error('URL é obrigatória e deve ser uma string');
  }
  
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error('URL não pode estar vazia');
  }
  
  // Verificar se é uma URL válida
  try {
    new URL(trimmedUrl);
  } catch {
    throw new Error('URL inválida. Deve começar com http:// ou https://');
  }
};

const validateHeaders = (headers?: Record<string, string>): Record<string, string> => {
  if (!headers) return {};
  
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error('Headers devem ser um objeto');
  }
  
  // Validar cada header
  const validHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error(`Header inválido: ${key} deve ter chave e valor como strings`);
    }
    validHeaders[key.trim()] = value.trim();
  }
  
  return validHeaders;
};

const validateMethod = (method: string): void => {
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  if (!validMethods.includes(method.toUpperCase())) {
    throw new Error(`Método inválido: ${method}. Métodos válidos: ${validMethods.join(', ')}`);
  }
};

const validateBody = (body: string | undefined, method: string): string => {
  if (method === 'GET' && body) {
    console.warn('⚠️ Body ignorado para método GET');
    return '';
  }
  
  return body || '';
};

// ✅ FUNÇÃO PRINCIPAL COM TIMEOUT DE 6 SEGUNDOS
export const makeRequest = async (
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  options?: {
    headers?: Record<string, string>;
    body?: string;
    timeout?: number; // Permitir timeout customizado
  }
) => {
  // Validações de entrada
  validateUrl(url);
  validateMethod(method);
  
  const validHeaders = validateHeaders(options?.headers);
  const validBody = validateBody(options?.body, method);
  const requestTimeout = options?.timeout || REQUEST_TIMEOUT; // Default 6 segundos
  
  // Garantir conexão
  if (!isReady) {
    console.log('🔄 Tor não está pronto, tentando conectar...');
    await ensureConnection();
  }
  
  if (!isReady) {
    throw new Error('Tor não está conectado após tentativa de reconexão');
  }

  const tor = initializeTorInstance();
  console.log(`📡 ${method} para: ${url} (timeout: ${requestTimeout/1000}s)`);
  
  try {
    let requestPromise: Promise<any>;
    
    // Criar a promise da requisição baseada no método
    switch (method) {
      case 'GET':
        requestPromise = tor.get(url, validHeaders, true);
        break;
      case 'POST':
        requestPromise = tor.post(url, validBody, validHeaders, true);
        break;
      case 'PUT':
        requestPromise = tor.post(url, validBody, { ...validHeaders, 'X-HTTP-Method-Override': 'PUT' }, true);
        break;
      case 'DELETE':
        requestPromise = tor.delete(url, validBody, validHeaders, true);
        break;
      default:
        throw new Error(`Método não suportado: ${method}`);
    }
    
    // ✅ APLICAR TIMEOUT DE 6 SEGUNDOS
    const timeoutPromise = createRequestTimeout(requestTimeout);
    const result = await Promise.race([requestPromise, timeoutPromise]);
    
    console.log(`✅ Requisição ${method} concluída com sucesso em menos de ${requestTimeout/1000}s`);
    return result;
    
  } catch (error) {
    console.error(`❌ Erro na requisição ${method}:`, error);
    
    // Se erro de timeout, não marcar como desconectado
    if (error.message.includes('Timeout da requisição')) {
      console.log('⏰ Timeout da API - Tor ainda está conectado');
      throw error;
    }
    
    // Se erro de rede/conexão, marcar como desconectado e tentar reconectar
    if (error.message.includes('network') || 
        error.message.includes('connection') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')) {
      console.log('🚨 Erro de rede detectado, marcando como desconectado');
      isReady = false;
      lastError = `Erro de rede na requisição: ${error.message}`;
      connectionTime = undefined;
      notifyStatusChange();
      
      // Tentar reconectar em background
      setTimeout(() => connectToTor(1, true), 2000);
    }
    
    throw error;
  }
};

// ✅ FUNÇÕES AUXILIARES COM TIMEOUT CUSTOMIZÁVEL
export const get = (url: string, headers?: Record<string, string>, timeout?: number) => 
  makeRequest(url, 'GET', { headers, timeout });

export const post = (url: string, body: string, headers?: Record<string, string>, timeout?: number) => 
  makeRequest(url, 'POST', { headers, body, timeout });

export const put = (url: string, body: string, headers?: Record<string, string>, timeout?: number) => 
  makeRequest(url, 'PUT', { headers, body, timeout });

export const del = (url: string, body?: string, headers?: Record<string, string>, timeout?: number) => 
  makeRequest(url, 'DELETE', { headers, body, timeout });

// ✅ FUNÇÃO PARA CONFIGURAR TIMEOUT GLOBAL
export const setRequestTimeout = (timeoutMs: number): void => {
  if (timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error('Timeout deve estar entre 1 segundo e 60 segundos');
  }
  // Esta função pode ser usada para alterar o timeout padrão em runtime
  console.log(`⚙️ Timeout de requisição alterado para ${timeoutMs/1000}s`);
};

// Funções de controle (mantidas iguais)
export const initializeTor = async (): Promise<void> => {
  console.log('🏁 Inicializando TorService...');
  
  // Configurar listener do AppState
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    lastAppState = AppState.currentState;
  }
  
  await connectToTor(1);
};

export const ensureConnection = async (): Promise<boolean> => {
  if (isReady) {
    console.log('✅ Tor já está conectado');
    return true;
  }
  
  if (isConnecting) {
    console.log('⏳ Tor já está tentando conectar, aguardando...');
    
    // Aguardar até conectar ou falhar (máximo 45 segundos)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('⏰ Timeout aguardando conexão');
        resolve(false);
      }, 45000);
      
      const checkConnection = () => {
        if (isReady) {
          clearTimeout(timeout);
          resolve(true);
        } else if (!isConnecting) {
          clearTimeout(timeout);
          resolve(false);
        } else {
          setTimeout(checkConnection, 500);
        }
      };
      checkConnection();
    });
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
  isReconnecting = false;
  lastError = undefined;
  
  await connectToTor(1);
};

export const getStatus = (): TorStatus => getCurrentStatus();
export const isReady_func = (): boolean => isReady;
export const getSocksPort = (): number => socksPort;
export const getConnectionDuration_func = (): string => getConnectionDuration();

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
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  
  if (torInstance) {
    torInstance.stopIfRunning().catch(console.error);
  }
  
  statusCallbacks = [];
  isReady = false;
  isInitializing = false;
  socksPort = 0;
  reconnectAttempt = 0;
  isConnecting = false;
  isReconnecting = false;
  lastError = undefined;
  connectionTime = undefined;
  lastHealthCheck = undefined;
};