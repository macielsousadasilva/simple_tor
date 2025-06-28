import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { TorStatus, onStatusChange, initializeTor, get, cleanup } from '../../services/TorService';

export default function SuperSimple() {
  const [torReady, setTorReady] = useState(false);
  const [result, setResult] = useState('Clique no botão para testar!');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onStatusChange((status: TorStatus) => {
      setTorReady(status.isReady);
    });
    initializeTor();
    return () => { unsubscribe(); cleanup(); };
  }, []);

  const testAPI = async () => {
    setLoading(true);
    try {
      const response = await get(
        'http://aqqxvfk7lgweiidgasz4doevgqdssrghww26myiipfpuijgdyymh46ad.onion/api/1.json'
      );
      setResult(`✅ Sucesso!\n${JSON.stringify(response, null, 2)}`);
    } catch (error) {
      setResult(`❌ Erro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧅 Tor Test</Text>
      
      <Text style={styles.status}>
        Status: {torReady ? '✅ Conectado' : '⏳ Conectando...'}
      </Text>

      <TouchableOpacity
        style={[styles.button, (!torReady || loading) && styles.buttonDisabled]}
        onPress={testAPI}
        disabled={!torReady || loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>🚀 Testar API</Text>
        )}
      </TouchableOpacity>

      <View style={styles.resultBox}>
        <Text style={styles.resultText} selectable>{result}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  status: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  button: {
    backgroundColor: '#4caf50',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultBox: {
    flex: 1,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    elevation: 2,
  },
  resultText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
  },
});