import React, { useEffect, useState } from 'react';
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
  cleanup 
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

  const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const;

  useEffect(() => {
    const unsubscribe = onStatusChange(setTorStatus);
    initializeTor();
    
    return () => {
      unsubscribe();
      cleanup();
    };
  }, []);

  // ✅ VERSÃO SIMPLIFICADA - Fazer requisição
  const handleMakeRequest = async () => {
    if (!torStatus.isReady || isLoading) return;

    setIsLoading(true);
    setResponse('🔄 Fazendo requisição...');
    
    try {
      // Parse dos headers
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (e) {
        throw new Error('Headers inválidos - deve ser JSON válido');
      }
      
      let result;
      
      // ✅ OPÇÃO 1: Usando makeRequest simplificado
      result = await makeRequest(url, method, {
        headers: parsedHeaders,
        body: (method === 'POST' || method === 'PUT' || method === 'DELETE') ? body : undefined,
      });
      
      // ✅ OPÇÃO 2: Usando funções auxiliares (mais limpo)
      // switch (method) {
      //   case 'GET':
      //     result = await get(url, parsedHeaders);
      //     break;
      //   case 'POST':
      //     result = await post(url, body, parsedHeaders);
      //     break;
      //   case 'PUT':
      //     result = await put(url, body, parsedHeaders);
      //     break;
      //   case 'DELETE':
      //     result = await del(url, body, parsedHeaders);
      //     break;
      // }
      
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
      
    } catch (error) {
      console.error(`❌ Erro na requisição:`, error);
      setResponse(`❌ Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ EXEMPLOS DE USO SIMPLIFICADO
  const exemploSimples = async () => {
    setIsLoading(true);
    try {
      // Exemplo 1: GET simples
      const resultado1 = await get('http://example.onion/api/users');
      
      // Exemplo 2: POST com dados
      const resultado2 = await post(
        'http://example.onion/api/users',
        JSON.stringify({ name: 'João', age: 30 }),
        { 'Content-Type': 'application/json' }
      );
      
      // Exemplo 3: Usando makeRequest
      const resultado3 = await makeRequest(
        'http://example.onion/api/search',
        'GET',
        { headers: { 'Accept': 'application/json' } }
      );
      
      console.log('✅ Resultados:', { resultado1, resultado2, resultado3 });
      setResponse(`Exemplos executados com sucesso!\nVeja o console para detalhes.`);
      
    } catch (error) {
      console.error('❌ Erro nos exemplos:', error);
      setResponse(`❌ Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = () => {
    reconnect();
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1976d2" barStyle="light-content" />
      
      {/* Header */}
      <View style={[
        styles.header,
        torStatus.isReady && styles.headerSuccess,
        (!torStatus.isReady && !torStatus.isInitializing) && styles.headerError
      ]}>
        <Text style={styles.title}>🧅 Tor HTTP Client (Simplificado)</Text>
        <View style={styles.statusContainer}>
          {torStatus.isInitializing ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.statusText}>
                {torStatus.reconnectAttempt > 1 ? `Reconectando... (${torStatus.reconnectAttempt})` : 'Conectando...'}
              </Text>
            </View>
          ) : torStatus.isReady ? (
            <Text style={styles.statusText}>✅ Conectado - Porta {torStatus.socksPort}</Text>
          ) : (
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>❌ Desconectado</Text>
              <TouchableOpacity 
                style={styles.reconnectButton}
                onPress={handleReconnect}
                activeOpacity={0.7}
              >
                <Text style={styles.reconnectButtonText}>🔄</Text>
              </TouchableOpacity>
            </View>
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
            🚀 Executar Exemplos Simplificados
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
  headerSuccess: {
    backgroundColor: '#4caf50',
  },
  headerError: {
    backgroundColor: '#f44336',
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
  reconnectButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  reconnectButtonText: {
    color: 'white',
    fontSize: 12,
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