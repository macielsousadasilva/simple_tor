import React, { useEffect, useState, useRef } from 'react';
import { 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  View, 
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  TextInput
} from 'react-native';
import Tor from 'react-native-tor';

const tor = Tor({
  stopDaemonOnBackground: false,
  bootstrapTimeoutMs: 60000,
  clientTimeoutSeconds: 90,
});

export default function App() {
  const [torReady, setTorReady] = useState(false);
  const [socksPort, setSocksPort] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  
  // Estados da requisição
  const [url, setUrl] = useState('http://aqqxvfk7lgweiidgasz4doevgqdssrghww26myiipfpuijgdyymh46ad.onion/api/1.json');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [headers, setHeaders] = useState('{\n  "User-Agent": "TorApp/1.0",\n  "Accept": "application/json"\n}');
  const [body, setBody] = useState('{\n  "test": "data"\n}');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs para controle
  const connectionTimeout = useRef<NodeJS.Timeout>();
  const healthCheckInterval = useRef<NodeJS.Timeout>();
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const isConnecting = useRef(false);

  const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const;

  // Conectar ao Tor
  const connectToTor = async (attempt = 1) => {
    if (isConnecting.current) return;
    
    isConnecting.current = true;
    setIsInitializing(true);
    setReconnectAttempt(attempt);
    
    console.log(`🚀 Tentativa ${attempt} - Iniciando Tor...`);
    
    try {
      if (connectionTimeout.current) clearTimeout(connectionTimeout.current);
      
      const timeoutPromise = new Promise((_, reject) => {
        connectionTimeout.current = setTimeout(() => {
          reject(new Error('Timeout de 20 segundos'));
        }, 20000);
      });
      
      const connectPromise = tor.startIfNotStarted();
      const port = await Promise.race([connectPromise, timeoutPromise]);
      
      if (connectionTimeout.current) clearTimeout(connectionTimeout.current);
      
      console.log(`✅ Tor conectado na porta: ${port}`);
      setSocksPort(port);
      setTorReady(true);
      setIsInitializing(false);
      isConnecting.current = false;
      
      startHealthCheck();
      
    } catch (error) {
      console.error(`❌ Tentativa ${attempt} falhou:`, error);
      isConnecting.current = false;
      
      reconnectTimeout.current = setTimeout(() => {
        connectToTor(attempt + 1);
      }, 3000);
    }
  };

  // Monitoramento de saúde
  const startHealthCheck = () => {
    if (healthCheckInterval.current) clearInterval(healthCheckInterval.current);
    
    healthCheckInterval.current = setInterval(async () => {
      try {
        const status = await tor.getDaemonStatus();
        
        if (status !== 'DONE' && torReady) {
          console.log(`🚨 Conexão perdida! Status: ${status}`);
          setTorReady(false);
          
          if (healthCheckInterval.current) clearInterval(healthCheckInterval.current);
          
          setTimeout(() => {
            connectToTor(1);
          }, 10000);
        }
      } catch (error) {
        console.error('⚠️ Erro no health check:', error);
      }
    }, 5000);
  };

  useEffect(() => {
    connectToTor(1);
    
    return () => {
      if (connectionTimeout.current) clearTimeout(connectionTimeout.current);
      if (healthCheckInterval.current) clearInterval(healthCheckInterval.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      tor.stopIfRunning().catch(console.error);
    };
  }, []);

  // Fazer requisição
  const makeRequest = async () => {
    if (!torReady || isLoading) return;

    setIsLoading(true);
    setResponse('🔄 Fazendo requisição...');
    
    try {
      console.log(`📡 ${method} para:`, url);
      
      // Parse dos headers
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (e) {
        throw new Error('Headers inválidos - deve ser JSON válido');
      }
      
      let result;
      
      switch (method) {
        case 'GET':
          result = await tor.get(url, parsedHeaders, true);
          break;
        case 'POST':
          result = await tor.post(url, body, parsedHeaders, true);
          break;
        case 'PUT':
          // Usando POST como fallback para PUT (limitação da lib)
          result = await tor.post(url, body, { ...parsedHeaders, 'X-HTTP-Method-Override': 'PUT' }, true);
          break;
        case 'DELETE':
          result = await tor.delete(url, body, parsedHeaders, true);
          break;
      }
      
      // Formatar resposta
      let formattedResponse = `Status: ${result.respCode}\n`;
      formattedResponse += `MIME Type: ${result.mimeType}\n\n`;
      
      if (result.headers) {
        formattedResponse += `Headers:\n${JSON.stringify(result.headers, null, 2)}\n\n`;
      }
      
      if (result.json) {
        formattedResponse += `JSON Response:\n${JSON.stringify(result.json, null, 2)}`;
      } else if (result.b64Data) {
        try {
          const decoded = atob(result.b64Data);
          formattedResponse += `Response Body:\n${decoded}`;
        } catch (e) {
          formattedResponse += `Base64 Data:\n${result.b64Data.substring(0, 1000)}${result.b64Data.length > 1000 ? '...' : ''}`;
        }
      } else {
        formattedResponse += 'Sem dados na resposta';
      }
      
      setResponse(formattedResponse);
      console.log(`✅ Requisição concluída`);
      
    } catch (error) {
      console.error(`❌ Erro na requisição:`, error);
      setResponse(`❌ Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1976d2" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🧅 Tor HTTP Client</Text>
        <View style={styles.statusContainer}>
          {isInitializing ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.statusText}>
                {reconnectAttempt > 1 ? `Reconectando... (${reconnectAttempt})` : 'Conectando...'}
              </Text>
            </View>
          ) : torReady ? (
            <Text style={styles.statusText}>✅ Conectado - Porta {socksPort}</Text>
          ) : (
            <Text style={styles.statusText}>❌ Desconectado</Text>
          )}
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* URL Input */}
        <View style={styles.section}>
          <Text style={styles.label}>URL:</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="Digite a URL..."
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        </View>

        {/* Method Selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Método:</Text>
          <View style={styles.methodContainer}>
            {methods.map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.methodButton,
                  method === m && styles.methodButtonActive
                ]}
                onPress={() => setMethod(m)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.methodButtonText,
                  method === m && styles.methodButtonTextActive
                ]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Headers */}
        <View style={styles.section}>
          <Text style={styles.label}>Headers (JSON):</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={headers}
            onChangeText={setHeaders}
            placeholder='{"Content-Type": "application/json"}'
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Body (para POST, PUT, DELETE) */}
        {(method === 'POST' || method === 'PUT' || method === 'DELETE') && (
          <View style={styles.section}>
            <Text style={styles.label}>Body:</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={body}
              onChangeText={setBody}
              placeholder='{"key": "value"}'
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!torReady || isLoading) && styles.sendButtonDisabled
          ]}
          onPress={makeRequest}
          disabled={!torReady || isLoading}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.sendButtonText}>
              📡 Enviar {method}
            </Text>
          )}
        </TouchableOpacity>

        {/* Response */}
        <View style={styles.section}>
          <Text style={styles.label}>Resposta:</Text>
          <ScrollView style={styles.responseContainer} nestedScrollEnabled>
            <Text style={styles.responseText} selectable>
              {response || 'Nenhuma resposta ainda...'}
            </Text>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1976d2',
    padding: 20,
    paddingTop: 40,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  statusContainer: {
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  methodContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    elevation: 1,
  },
  methodButtonActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  methodButtonText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  methodButtonTextActive: {
    color: 'white',
  },
  sendButton: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  responseContainer: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    maxHeight: 300,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  responseText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    lineHeight: 16,
  },
});