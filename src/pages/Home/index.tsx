import React, { useEffect, useState, useRef } from 'react';
import { 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  View, 
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Alert
} from 'react-native';
import { 
  TorStatus, 
  onStatusChange, 
  initializeTor, 
  makeRequest,
  get,
  post,
  put,
  del,
  reconnect, 
  cleanup,
  getConnectionDuration_func
} from '../../services/TorService';

export default function App() {
  // Estados do Tor
  const [torStatus, setTorStatus] = useState<TorStatus>({
    isReady: false,
    isInitializing: true,
    socksPort: 0,
    reconnectAttempt: 0,
  });
  
  // Estados da requisição
  const [url, setUrl] = useState('http://aqqxvfk7lgweiidgasz4doevgqdssrghww26myiipfpuijgdyymh46ad.onion/api/1.json');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [headers, setHeaders] = useState('{\n  "User-Agent": "TorApp/1.0",\n  "Accept": "application/json"\n}');
  const [body, setBody] = useState('{\n  "test": "data"\n}');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionDuration, setConnectionDuration] = useState('');

  const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const;
  const statusUpdateInterval = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const unsubscribe = onStatusChange((status: TorStatus) => {
      console.log('📊 Status atualizado no componente:', status);
      
      // Detectar mudanças importantes
      const wasConnected = torStatus.isReady;
      const isNowConnected = status.isReady;
      
      setTorStatus(status);
      
      // Alertas para mudanças de estado
      if (isNowConnected && !wasConnected && !status.isReconnecting) {
        Alert.alert('🎉 Conectado!', 'Tor está conectado e pronto para uso');
      } else if (!isNowConnected && wasConnected) {
        Alert.alert('⚠️ Desconectado', status.lastError || 'Conexão perdida');
      } else if (status.isReconnecting) {
        console.log('🔄 Reconectando automaticamente...');
      }
    });

    // Atualizar duração da conexão em tempo real
    statusUpdateInterval.current = setInterval(() => {
      if (torStatus.isReady) {
        setConnectionDuration(getConnectionDuration_func());
      } else {
        setConnectionDuration('');
      }
    }, 1000);

    initializeTor();
    
    return () => { 
      unsubscribe(); 
      cleanup();
      if (statusUpdateInterval.current) {
        clearInterval(statusUpdateInterval.current);
      }
    };
  }, []);

  // ✅ Fazer requisição com validações
  const handleMakeRequest = async () => {
    if (!torStatus.isReady || isLoading) return;

    setIsLoading(true);
    setResponse('🔄 Fazendo requisição...');
    
    try {
      // Validar URL
      if (!url.trim()) {
        throw new Error('URL é obrigatória');
      }
      
      // Parse e validação dos headers
      let parsedHeaders = {};
      if (headers.trim()) {
        try {
          parsedHeaders = JSON.parse(headers);
          if (typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
            throw new Error('Headers devem ser um objeto JSON válido');
          }
        } catch (e) {
          throw new Error('Headers inválidos - deve ser JSON válido');
        }
      }
      
      // Validar body para métodos que precisam
      let requestBody = '';
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        requestBody = body.trim();
        if (requestBody) {
          try {
            JSON.parse(requestBody); // Validar se é JSON válido
          } catch (e) {
            console.warn('⚠️ Body não é JSON válido, enviando como texto');
          }
        }
      }
      
      console.log(`📡 Enviando ${method} para: ${url}`);
      console.log(`📋 Headers:`, parsedHeaders);
      if (requestBody) console.log(`📄 Body:`, requestBody);
      
      // Fazer requisição
      const result = await makeRequest(url.trim(), method, {
        headers: parsedHeaders,
        body: requestBody || undefined,
      });
      
      // Formatar resposta
      let formattedResponse = `✅ Requisição ${method} bem-sucedida!\n\n`;
      formattedResponse += `Status: ${result.respCode || 'N/A'}\n`;
      formattedResponse += `MIME Type: ${result.mimeType || 'N/A'}\n`;
      formattedResponse += `Timestamp: ${new Date().toLocaleString()}\n\n`;
      
      if (result.headers && Object.keys(result.headers).length > 0) {
        formattedResponse += `📋 Headers de Resposta:\n${JSON.stringify(result.headers, null, 2)}\n\n`;
      }
      
      if (result.json) {
        formattedResponse += `📄 JSON Response:\n${JSON.stringify(result.json, null, 2)}`;
      } else if (result.b64Data) {
        try {
          const decoded = atob(result.b64Data);
          if (decoded.length > 2000) {
            formattedResponse += `📄 Response Body (${decoded.length} chars):\n${decoded.substring(0, 2000)}...\n\n[Resposta truncada]`;
          } else {
            formattedResponse += `📄 Response Body:\n${decoded}`;
          }
        } catch (e) {
          const preview = result.b64Data.substring(0, 500);
          formattedResponse += `📄 Base64 Data (${result.b64Data.length} chars):\n${preview}${result.b64Data.length > 500 ? '...' : ''}`;
        }
      } else {
        formattedResponse += '📄 Sem dados na resposta';
      }
      
      setResponse(formattedResponse);
      
    } catch (error) {
      console.error(`❌ Erro na requisição:`, error);
      const errorResponse = `❌ Erro na requisição ${method}:\n\n${error.message}\n\nTimestamp: ${new Date().toLocaleString()}`;
      setResponse(errorResponse);
      
      // Mostrar alerta para erros críticos
      if (error.message.includes('Tor não está conectado')) {
        Alert.alert(
          '🚨 Erro de Conexão',
          'Tor não está conectado. Tentando reconectar...',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Reconectar Agora', onPress: handleReconnect }
          ]
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Exemplo simplificado com validações
  const exemploSimples = async () => {
    if (!torStatus.isReady) {
      Alert.alert('⚠️ Tor Desconectado', 'Aguarde a conexão ser estabelecida');
      return;
    }

    setIsLoading(true);
    setResponse('🔄 Executando exemplos...');
    
    try {
      // Exemplo 1: GET simples
      console.log('📡 Exemplo 1: GET simples');
      const resultado1 = await get(url);
      
      // Exemplo 2: POST com dados (se URL suportar)
      console.log('📡 Exemplo 2: POST com dados');
      const postData = JSON.stringify({ 
        timestamp: new Date().toISOString(),
        test: 'exemplo_post' 
      });
      
      let resultado2;
      try {
        resultado2 = await post(url, postData, { 'Content-Type': 'application/json' });
      } catch (e) {
        console.log('⚠️ POST falhou (esperado para APIs somente leitura)');
        resultado2 = { error: 'POST não suportado pela API' };
      }
      
      const exemplosResponse = `✅ Exemplos executados com sucesso!\n\nTimestamp: ${new Date().toLocaleString()}\n\n📋 Resultado GET:\n${JSON.stringify(resultado1, null, 2)}\n\n📋 Resultado POST:\n${JSON.stringify(resultado2, null, 2)}`;
      setResponse(exemplosResponse);
      
    } catch (error) {
      console.error('❌ Erro nos exemplos:', error);
      setResponse(`❌ Erro nos exemplos: ${error.message}\n\nTimestamp: ${new Date().toLocaleString()}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = () => {
    Alert.alert(
      '🔄 Reconectando',
      'Tentando estabelecer nova conexão com Tor...'
    );
    reconnect();
  };

  const getStatusColor = () => {
    if (torStatus.isReady) return '#4caf50';
    if (torStatus.isInitializing || torStatus.isReconnecting) return '#ff9800';
    return '#f44336';
  };

  const getStatusText = () => {
    if (torStatus.isReady) {
      return `✅ Conectado${connectionDuration ? ` (${connectionDuration})` : ''}`;
    }
    if (torStatus.isReconnecting) {
      return `🔄 Reconectando... ${torStatus.reconnectAttempt > 0 ? `(${torStatus.reconnectAttempt}/5)` : ''}`;
    }
    if (torStatus.isInitializing) {
      return `⏳ Conectando... ${torStatus.reconnectAttempt > 0 ? `(${torStatus.reconnectAttempt}/5)` : ''}`;
    }
    return '❌ Desconectado';
  };

  const getDetailedInfo = () => {
    const info = [];
    if (torStatus.socksPort > 0) info.push(`Porta: ${torStatus.socksPort}`);
    if (torStatus.lastError) info.push(`Erro: ${torStatus.lastError}`);
    if (torStatus.lastHealthCheck) {
      info.push(`Último check: ${new Date(torStatus.lastHealthCheck).toLocaleTimeString()}`);
    }
    return info.join(' | ');
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={getStatusColor()} barStyle="light-content" />
      
      {/* Header com status em tempo real */}
      <View style={[styles.header, { backgroundColor: getStatusColor() }]}>
        <Text style={styles.title}>🧅 Tor HTTP Client</Text>
        <View style={styles.statusContainer}>
          {(torStatus.isInitializing || torStatus.isReconnecting) ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.statusText}>{getStatusText()}</Text>
            </View>
          ) : (
            <View style={styles.statusColumn}>
              <Text style={styles.statusText}>{getStatusText()}</Text>
              {getDetailedInfo() && (
                <Text style={styles.statusDetails}>{getDetailedInfo()}</Text>
              )}
            </View>
          )}
          
          {!torStatus.isReady && !torStatus.isInitializing && !torStatus.isReconnecting && (
            <TouchableOpacity 
              style={styles.reconnectButton}
              onPress={handleReconnect}
              activeOpacity={0.7}
            >
              <Text style={styles.reconnectButtonText}>🔄 Reconectar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Botão de exemplo simplificado */}
        <TouchableOpacity
          style={[styles.exampleButton, (!torStatus.isReady || isLoading) && styles.sendButtonDisabled]}
          onPress={exemploSimples}
          disabled={!torStatus.isReady || isLoading}
          activeOpacity={0.7}
        >
          <Text style={styles.sendButtonText}>
            🚀 Executar Exemplos Validados
          </Text>
        </TouchableOpacity>

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

        {/* Body */}
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
            (!torStatus.isReady || isLoading) && styles.sendButtonDisabled
          ]}
          onPress={handleMakeRequest}
          disabled={!torStatus.isReady || isLoading}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.sendButtonText}>
              📡 Enviar {method} Validado
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
  statusColumn: {
    alignItems: 'center',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  statusDetails: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  reconnectButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  reconnectButtonText: {
    color: 'white',
    fontSize: 12,
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
  exampleButton: {
    backgroundColor: '#ff9800',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
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