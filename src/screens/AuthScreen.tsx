import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  onSuccess: () => void;
}

export default function AuthScreen({ onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Uyarı', 'Lütfen e-posta ve şifrenizi girin.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Uyarı', 'Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Giriş Yap
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) throw error;
        onSuccess();
      } else {
        // Kayıt Ol
        const { error, data } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              full_name: fullName.trim() || 'Öğretmen',
            },
          },
        });
        if (error) throw error;

        // Oturum açıldı mı kontrol
        if (data.session) {
          Alert.alert('Hoş Geldiniz 🎉', 'Hesabınız oluşturuldu!');
          onSuccess();
        } else {
          Alert.alert(
            'Kayıt Başarılı 📩',
            'Eğer doğrulama e-postası gerekiyorsa lütfen gelen kutunuzu kontrol edin, ardından giriş yapın.'
          );
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      let msg = err.message || 'Bir hata oluştu';
      if (msg.includes('Invalid login credentials')) {
        msg = 'E-posta veya şifre hatalı!';
      } else if (msg.includes('User already registered')) {
        msg = 'Bu e-posta adresiyle zaten bir hesap var.';
      }
      Alert.alert('Giriş Başarısız', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Karşılama İkonu & Başlık */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="school" size={40} color="#4F46E5" />
          </View>
          <Text style={styles.appTitle}>Özel Ders Asistanı</Text>
          <Text style={styles.appSubtitle}>
            {isLogin
              ? 'Derslerinizi ve kazançlarınızı yönetmek için giriş yapın.'
              : 'Yeni bir öğretmen hesabı oluşturun ve hemen başlayın.'}
          </Text>
        </View>

        {/* Giriş / Kayıt Geçiş Sekmesi */}
        <View style={styles.switchRow}>
          <TouchableOpacity
            style={[styles.switchBtn, isLogin && styles.switchBtnActive]}
            onPress={() => setIsLogin(true)}
          >
            <Text style={[styles.switchText, isLogin && styles.switchTextActive]}>Giriş Yap</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchBtn, !isLogin && styles.switchBtnActive]}
            onPress={() => setIsLogin(false)}
          >
            <Text style={[styles.switchText, !isLogin && styles.switchTextActive]}>Kayıt Ol</Text>
          </TouchableOpacity>
        </View>

        {/* Form Alanları */}
        <View style={styles.formCard}>
          {!isLogin && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Adınız Soyadınız</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Örn: Hilal Öğretmen"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-posta Adresi</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="ornek@gmail.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Şifre</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="En az 6 karakter"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Ana Buton */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isLogin ? 'Giriş Yap 🚀' : 'Hesap Oluştur ✨'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Alt Güvenlik Notu */}
        <View style={styles.footer}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" />
          <Text style={styles.footerText}>
            Verileriniz uçtan uca güvenli ve yalnızca size özeldir.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  appSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  switchRow: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  switchBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  switchText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  switchTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  footerText: {
    fontSize: 12,
    color: '#64748B',
  },
});

