import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/lib/supabase';
import { Student, Lesson } from './src/types';
import AuthScreen from './src/screens/AuthScreen';
import type { Session, User } from '@supabase/supabase-js';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Dark Mode Durumu (Varsayılan: Gece modu açık mı?)
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [activeTab, setActiveTab] = useState<'lessons' | 'students' | 'stats'>('lessons');

  // Veri durumları
  const [students, setStudents] = useState<Student[]>([]);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtreler: Varsayılan olarak bugünün ayını ve yılını al (Örn: Kasım = 11)
  const currentRealDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentRealDate.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(currentRealDate.getFullYear());
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null); // 'YYYY-MM-DD'
  const [studentFilter, setStudentFilter] = useState<'all' | 'active' | 'passive'>('active');
  const [statsViewMode, setStatsViewMode] = useState<'student' | 'source'>('student'); // 'student' veya 'source'

  // Ay Scroll Referansı (Seçili aya otomatik kaydırma)
  const monthScrollRef = React.useRef<any>(null);

  // Modal: Ders Ekle / Düzenle
  const [lessonModalVisible, setLessonModalVisible] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState(''); // Öğrenci Arama Filtresi
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // Açılır Menü
  const [lessonDate, setLessonDate] = useState(new Date().toISOString().split('T')[0]);
  const [lessonHours, setLessonHours] = useState('1');
  const [lessonRate, setLessonRate] = useState('1000');
  const [lessonNotes, setLessonNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal: Öğrenci Ekle / Düzenle
  const [studentModalVisible, setStudentModalVisible] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentRate, setStudentRate] = useState('1000');
  const [studentSource, setStudentSource] = useState('Elden');
  const [studentColor, setStudentColor] = useState('#3B82F6');
  const [studentIsActive, setStudentIsActive] = useState(true);

  const colorPalette = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

  // Oturum Durumunu Dinle (Kullanıcı çıkış yapmadıkça şifre sormaz!)
  useEffect(() => {
    // Mevcut oturumu al
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // Oturum değişikliklerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Veri Çekme
  const fetchData = async () => {
    if (!session?.user) return;
    try {
      // 1. Öğrenciler (Sadece kendi öğrencileri)
      const { data: sData, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', session.user.id)
        .order('is_active', { ascending: false })
        .order('name');
      if (sErr) throw sErr;
      if (sData) setStudents(sData);

      // 2. Tüm Dersler (Sadece kendi dersleri)
      const { data: lData, error: lErr } = await supabase
        .from('lessons')
        .select('*, students(*)')
        .eq('user_id', session.user.id)
        .order('lesson_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (lErr) throw lErr;
      if (lData) setAllLessons(lData as any);
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      setLoading(true);
      fetchData();

      // Realtime senkronizasyon (Sadece kendi verileri)
      const channel = supabase
        .channel(`user-changes-${session.user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', filter: `user_id=eq.${session.user.id}` },
          () => {
            fetchData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session?.user?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Seçili ay değiştiğinde veya sayfa ilk açıldığında o aya garantili otomatik kaydır
  useEffect(() => {
    const timer = setTimeout(() => {
      if (monthScrollRef.current) {
        // Her ay butonu yaklaşık 78px
        const targetX = Math.max(0, (selectedMonth - 1) * 78 - 100);
        if (typeof monthScrollRef.current.scrollTo === 'function') {
          monthScrollRef.current.scrollTo({ x: targetX, animated: true });
        } else if (monthScrollRef.current.scrollLeft !== undefined) {
          monthScrollRef.current.scrollLeft = targetX;
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedMonth, activeTab]);
  const monthLessons = useMemo(() => {
    const monthStr = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`;
    const prefix = `${selectedYear}-${monthStr}`;
    return allLessons.filter(l => l.lesson_date && l.lesson_date.startsWith(prefix));
  }, [allLessons, selectedMonth, selectedYear]);

  // Günlük Takvim Filtresi
  const filteredLessons = useMemo(() => {
    if (selectedDateFilter) {
      return monthLessons.filter(l => l.lesson_date === selectedDateFilter);
    }
    return monthLessons;
  }, [monthLessons, selectedDateFilter]);

  // Ay içindeki günlerin ders sayıları (Takvim şeridi için)
  const daysInMonthWithLessons = useMemo(() => {
    const map: { [day: string]: number } = {};
    monthLessons.forEach(l => {
      map[l.lesson_date] = (map[l.lesson_date] || 0) + 1;
    });
    return map;
  }, [monthLessons]);

  // Ders Düzenleme Penceresini Aç
  const openEditLessonModal = (lesson: Lesson) => {
    setEditingLesson(lesson);
    const stu = students.find(s => s.id === lesson.student_id) || lesson.students || null;
    setSelectedStudent(stu);
    setLessonDate(lesson.lesson_date);
    setLessonHours(String(lesson.hours));
    setLessonRate(String(lesson.hourly_rate));
    setLessonNotes(lesson.notes || '');
    setLessonModalVisible(true);
  };

  // Yeni Ders Penceresini Aç
  const openNewLessonModal = (preselected?: Student) => {
    setEditingLesson(null);
    setSelectedStudent(preselected || (students.find(s => s.is_active) || null));
    setStudentSearchQuery('');
    setIsDropdownOpen(false);
    setLessonDate(selectedDateFilter || new Date().toISOString().split('T')[0]);
    setLessonHours('1');
    setLessonRate(preselected ? String(preselected.hourly_rate) : '1000');
    setLessonNotes('');
    setLessonModalVisible(true);
  };

  // Ders Kaydet (Ekle veya Güncelle)
  const handleSaveLesson = async () => {
    if (!selectedStudent) {
      Alert.alert('Uyarı', 'Lütfen bir öğrenci seçin');
      return;
    }
    const hoursNum = parseFloat(lessonHours);
    const rateNum = parseFloat(lessonRate);
    if (isNaN(hoursNum) || hoursNum <= 0) {
      Alert.alert('Uyarı', 'Lütfen geçerli bir saat girin');
      return;
    }

    setSubmitting(true);
    try {
      if (editingLesson) {
        // Güncelle
        const { error } = await supabase
          .from('lessons')
          .update({
            student_id: selectedStudent.id,
            lesson_date: lessonDate,
            hours: hoursNum,
            hourly_rate: rateNum,
            notes: lessonNotes.trim() || null,
          })
          .eq('id', editingLesson.id);
        if (error) throw error;
        Alert.alert('Başarılı ✨', 'Ders kaydı güncellendi');
      } else {
        // Yeni Ekle
        const { error } = await supabase
          .from('lessons')
          .insert({
            user_id: session?.user?.id,
            student_id: selectedStudent.id,
            lesson_date: lessonDate,
            hours: hoursNum,
            hourly_rate: rateNum,
            notes: lessonNotes.trim() || null,
          });
        if (error) throw error;
        Alert.alert('Başarılı 🎉', 'Yeni ders kaydedildi');
      }
      setLessonModalVisible(false);
      fetchData();
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Kayıt işlemi başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  // Dersi Sil
  const executeDeleteLesson = async (lesson: Lesson) => {
    try {
      console.log('--- DERS SİLME BAŞLADI ---');
      console.log('Silinecek Ders ID:', lesson.id);
      console.log('Oturum Açık Kullanıcı ID:', session?.user?.id);

      const { data, error } = await supabase
        .from('lessons')
        .delete()
        .eq('id', lesson.id)
        .select();

      console.log('Supabase Delete Yanıtı:', { data, error });

      if (error) {
        console.error('Silme Hatası Detayı:', error);
        Alert.alert('Silme Hatası', `${error.message} (${error.code || ''})`);
        return;
      }

      if (!data || data.length === 0) {
        console.warn('Silinen satır sayısı 0! RLS engelliyor olabilir.');
        Alert.alert('Uyarı', 'Kayıt silinemedi (Yetki hatası veya kayıt bulunamadı).');
        return;
      }

      console.log('Ders başarıyla silindi!');
      Alert.alert('Silindi 🗑️', 'Ders kaydı başarıyla silindi.');
      fetchData();
    } catch (err: any) {
      console.error('Beklenmeyen Silme Hatası:', err);
      Alert.alert('Hata', err.message || 'Ders silinirken beklenmeyen bir hata oluştu');
    }
  };

  const handleDeleteLesson = (lesson: Lesson) => {
    // Web tarayıcısında window.confirm, mobilde Alert.alert
    if (typeof window !== 'undefined' && window.confirm) {
      const confirmed = window.confirm(
        `${lesson.students?.name || 'Öğrenci'} - ${lesson.lesson_date} dersini silmek istediğinize emin misiniz?`
      );
      if (confirmed) {
        executeDeleteLesson(lesson);
      }
    } else {
      Alert.alert(
        'Dersi Sil',
        `${lesson.students?.name || 'Öğrenci'} - ${lesson.lesson_date} dersini silmek istediğinize emin misiniz?`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Sil',
            style: 'destructive',
            onPress: () => executeDeleteLesson(lesson),
          },
        ]
      );
    }
  };

  // Öğrenci Düzenleme Aç
  const openEditStudent = (s: Student) => {
    setEditingStudent(s);
    setStudentName(s.name);
    setStudentRate(String(s.hourly_rate));
    setStudentSource(s.source || 'Elden');
    setStudentColor(s.color || '#3B82F6');
    setStudentIsActive(s.is_active);
    setStudentModalVisible(true);
  };

  // Öğrenci Kaydet
  const handleSaveStudent = async () => {
    if (!studentName.trim()) {
      Alert.alert('Uyarı', 'Öğrenci adı boş bırakılamaz');
      return;
    }
    setSubmitting(true);
    try {
      if (editingStudent) {
        const { error } = await supabase
          .from('students')
          .update({
            name: studentName.trim(),
            hourly_rate: parseFloat(studentRate) || 1000,
            color: studentColor,
            source: studentSource,
            is_active: studentIsActive,
          })
          .eq('id', editingStudent.id);
        if (error) throw error;
        Alert.alert('Başarılı', 'Öğrenci bilgileri güncellendi');
      } else {
        const { error } = await supabase
          .from('students')
          .insert({
            user_id: session?.user?.id,
            name: studentName.trim(),
            hourly_rate: parseFloat(studentRate) || 1000,
            currency: 'TL',
            color: studentColor,
            source: studentSource,
            is_active: studentIsActive,
          });
        if (error) throw error;
        Alert.alert('Başarılı 🎉', 'Yeni öğrenci eklendi');
      }
      setStudentModalVisible(false);
      fetchData();
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Öğrenci kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  // Hızlı Aktif/Pasif Değiştir
  const toggleStudentStatus = async (s: Student) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ is_active: !s.is_active })
        .eq('id', s.id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    }
  };

  // Ay İstatistikleri
  const monthTotalIncome = monthLessons.reduce((acc, l) => acc + (l.hours * l.hourly_rate), 0);
  const monthTotalHours = monthLessons.reduce((acc, l) => acc + l.hours, 0);

  // Öğrenci bazlı bu ayki dağılım
  const studentBreakdown = useMemo(() => {
    const map: { [name: string]: { hours: number; income: number; color: string; count: number } } = {};
    monthLessons.forEach(l => {
      const name = l.students?.name || 'Bilinmiyor';
      if (!map[name]) {
        map[name] = { hours: 0, income: 0, color: l.students?.color || '#3B82F6', count: 0 };
      }
      map[name].hours += l.hours;
      map[name].income += (l.hours * l.hourly_rate);
      map[name].count += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].income - a[1].income);
  }, [monthLessons]);

  // Kaynak (Source) bazlı bu ayki dağılım (Elden, Kurs, Kozman vb.)
  const sourceBreakdown = useMemo(() => {
    const map: { [source: string]: { hours: number; income: number; count: number; color: string } } = {};
    const sourceColors: { [key: string]: string } = {
      'Elden': '#10B981', // Yeşil
      'Kozman': '#6366F1', // İndigo / Mor
      'Kurs': '#F59E0B',   // Turuncu
      'Diğer': '#64748B'
    };

    monthLessons.forEach(l => {
      const src = l.students?.source || 'Elden';
      if (!map[src]) {
        map[src] = {
          hours: 0,
          income: 0,
          count: 0,
          color: sourceColors[src] || '#8B5CF6'
        };
      }
      map[src].hours += l.hours;
      map[src].income += (l.hours * l.hourly_rate);
      map[src].count += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].income - a[1].income);
  }, [monthLessons]);

  // Hesabı ve Tüm Verileri Sil (Apple App Store Zorunluluğu)
  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesabımı Sil',
      'Hesabınızı ve eklediğiniz TÜM öğrencileri, ders kayıtlarını kalıcı olarak silmek istediğinize emin misiniz? Bu işlem GERİ ALINAMAZ!',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Her Şeyi Sil',
          style: 'destructive',
          onPress: async () => {
            if (!session?.user?.id) return;
            try {
              setLoading(true);
              // 1. Kullanıcının tüm derslerini sil
              await supabase.from('lessons').delete().eq('user_id', session.user.id);
              // 2. Kullanıcının tüm öğrencilerini sil
              await supabase.from('students').delete().eq('user_id', session.user.id);
              // 3. Kullanıcının oturumunu kapat
              await supabase.auth.signOut();
              Alert.alert('Hesap Silindi', 'Tüm verileriniz ve hesabınız başarıyla silindi.');
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'Hesap silinirken bir hata oluştu');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Çıkış Yap
  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  // Öğrenci filtreleme
  const displayedStudents = useMemo(() => {
    if (studentFilter === 'active') return students.filter(s => s.is_active);
    if (studentFilter === 'passive') return students.filter(s => !s.is_active);
    return students;
  }, [students, studentFilter]);

  if (authLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  // Kullanıcı giriş yapmamışsa Login/Signup ekranını göster
  if (!session) {
    return <AuthScreen onSuccess={() => {}} />;
  }

  return (
    <SafeAreaView style={[styles.container, isDarkMode && { backgroundColor: '#0F172A' }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* ÜST HEADER */}
      <View style={[styles.header, isDarkMode && { backgroundColor: '#1E293B', borderBottomColor: '#334155' }]}>
        <View>
          <Text style={[styles.headerSubtitle, isDarkMode && { color: '#818CF8' }]}>
            {session.user.user_metadata?.full_name || 'ÖĞRETMEN ASİSTANI'}
          </Text>
          <Text style={[styles.headerTitle, isDarkMode && { color: '#F8FAFC' }]}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[styles.themeToggleBtn, isDarkMode && styles.themeToggleBtnDark]}
            onPress={() => setIsDarkMode(!isDarkMode)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isDarkMode ? 'sunny' : 'moon'}
              size={18}
              color={isDarkMode ? '#F59E0B' : '#4F46E5'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => openNewLessonModal()}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Ders Yaz</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.logoutBtn, isDarkMode && { backgroundColor: '#334155' }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={isDarkMode ? '#F87171' : '#4F46E5'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* YIL & AY SEÇİCİ ŞERİT */}
      <View style={styles.monthSelectorBar}>
        <ScrollView
          ref={monthScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthScroll}
        >
          {MONTH_NAMES.map((mName, index) => {
            const mNum = index + 1;
            const isSelected = selectedMonth === mNum;
            return (
              <TouchableOpacity
                key={mName}
                style={[styles.monthChip, isSelected && styles.monthChipActive]}
                onPress={() => {
                  setSelectedMonth(mNum);
                  setSelectedDateFilter(null);
                }}
              >
                <Text style={[styles.monthChipText, isSelected && styles.monthChipTextActive]}>
                  {mName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Veriler eşitleniyor...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* TAB 1: DERSLER & TAKVİM */}
          {activeTab === 'lessons' && (
            <FlatList
              data={filteredLessons}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              ListHeaderComponent={
                <View>
                  {/* Aylık Özet Kartı */}
                  <View style={styles.summaryCard}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Ders Sayısı</Text>
                      <Text style={styles.summaryValue}>{monthLessons.length} Ders</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Toplam Süre</Text>
                      <Text style={styles.summaryValue}>{monthTotalHours} Saat</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Hakediş</Text>
                      <Text style={[styles.summaryValue, { color: '#059669' }]}>
                        {monthTotalIncome.toLocaleString('tr-TR')} TL
                      </Text>
                    </View>
                  </View>

                  {/* Günlük Takvim Filtresi Barı */}
                  <View style={styles.dateFilterContainer}>
                    <View style={styles.dateFilterHeader}>
                      <Text style={styles.sectionHeaderTitle}>
                        {selectedDateFilter ? `📅 ${selectedDateFilter} Dersleri` : '📅 Tüm Ayın Dersleri'}
                      </Text>
                      {selectedDateFilter && (
                        <TouchableOpacity onPress={() => setSelectedDateFilter(null)}>
                          <Text style={styles.clearFilterText}>Tümünü Göster</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Gün Butonları */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                      {Object.keys(daysInMonthWithLessons).sort().map(dStr => {
                        const isDaySelected = selectedDateFilter === dStr;
                        const dayNum = dStr.split('-')[2];
                        const count = daysInMonthWithLessons[dStr];
                        return (
                          <TouchableOpacity
                            key={dStr}
                            style={[styles.dayBadge, isDaySelected && styles.dayBadgeActive]}
                            onPress={() => setSelectedDateFilter(isDaySelected ? null : dStr)}
                          >
                            <Text style={[styles.dayBadgeNum, isDaySelected && styles.dayBadgeNumActive]}>
                              {dayNum}
                            </Text>
                            <Text style={[styles.dayBadgeCount, isDaySelected && styles.dayBadgeCountActive]}>
                              {count} ders
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              }
              renderItem={({ item }) => {
                const sColor = item.students?.color || '#3B82F6';
                const total = item.hours * item.hourly_rate;
                return (
                  <View style={styles.lessonCard}>
                    <View style={[styles.colorBadge, { backgroundColor: sColor }]} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.studentName}>{item.students?.name || 'Öğrenci'}</Text>
                      <Text style={styles.lessonDate}>
                        {item.lesson_date} • {item.hours} Saat ({item.hourly_rate} TL/saat)
                      </Text>
                      {item.notes ? <Text style={styles.lessonNotes}>"{item.notes}"</Text> : null}
                    </View>

                    <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                      <Text style={styles.lessonPrice}>+{total.toLocaleString('tr-TR')} TL</Text>
                      <Text style={styles.sourceTag}>{item.students?.source || 'Elden'}</Text>
                    </View>

                    {/* Düzenle & Sil Butonları */}
                    <View style={styles.actionButtonsCol}>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => openEditLessonModal(item)}
                      >
                        <Ionicons name="pencil" size={16} color="#4F46E5" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleDeleteLesson(item)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.centerContainer}>
                  <Text style={styles.emptyText}>Bu dönemde ders kaydı bulunmuyor.</Text>
                </View>
              }
            />
          )}

          {/* TAB 2: ÖĞRENCİLER (Aktif / Pasif) */}
          {activeTab === 'students' && (
            <View style={{ flex: 1 }}>
              {/* Aktif / Pasif Filtre Tabları */}
              <View style={styles.studentFilterRow}>
                {(['active', 'all', 'passive'] as const).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.studentFilterBtn,
                      studentFilter === tab && styles.studentFilterBtnActive,
                    ]}
                    onPress={() => setStudentFilter(tab)}
                  >
                    <Text
                      style={[
                        styles.studentFilterBtnText,
                        studentFilter === tab && styles.studentFilterBtnTextActive,
                      ]}
                    >
                      {tab === 'active' ? '🟢 Aktifler' : tab === 'passive' ? '🔴 Pasifler' : 'Tümü'} (
                      {tab === 'active'
                        ? students.filter(s => s.is_active).length
                        : tab === 'passive'
                        ? students.filter(s => !s.is_active).length
                        : students.length}
                      )
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FlatList
                data={displayedStudents}
                keyExtractor={(item) => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                ListHeaderComponent={
                  <TouchableOpacity
                    style={styles.newStudentBtn}
                    onPress={() => {
                      setEditingStudent(null);
                      setStudentName('');
                      setStudentRate('1000');
                      setStudentSource('Elden');
                      setStudentColor('#3B82F6');
                      setStudentIsActive(true);
                      setStudentModalVisible(true);
                    }}
                  >
                    <Ionicons name="person-add" size={18} color="#4F46E5" />
                    <Text style={styles.newStudentBtnText}>Yeni Öğrenci Ekle</Text>
                  </TouchableOpacity>
                }
                renderItem={({ item }) => (
                  <View style={[styles.studentCard, !item.is_active && styles.passiveCard]}>
                    <View style={[styles.avatar, { backgroundColor: item.color || '#3B82F6' }]}>
                      <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.studentCardName, !item.is_active && { color: '#94A3B8' }]}>
                          {item.name}
                        </Text>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: item.is_active ? '#10B981' : '#EF4444' },
                          ]}
                        />
                      </View>
                      <Text style={styles.studentCardDetail}>
                        {item.hourly_rate} {item.currency} / saat • {item.source}
                      </Text>
                    </View>

                    {/* Hızlı Ders Ekle & Düzenle */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        style={styles.editStudentBtn}
                        onPress={() => openEditStudent(item)}
                      >
                        <Ionicons name="create-outline" size={20} color="#64748B" />
                      </TouchableOpacity>

                      {item.is_active && (
                        <TouchableOpacity
                          style={styles.quickAddLessonBtn}
                          onPress={() => openNewLessonModal(item)}
                        >
                          <Ionicons name="add-circle" size={28} color="#4F46E5" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              />
            </View>
          )}

          {/* TAB 3: ÖZET & DETAYLI AY ANALİZİ */}
          {activeTab === 'stats' && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {/* Ay Başlığı */}
              <View style={styles.statsHeaderBox}>
                <Text style={styles.statsMonthTitle}>
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Raporu
                </Text>
                <Text style={styles.statsMonthSub}>Bu ayın ayrıntılı kazanç ve saat dökümü</Text>
              </View>

              {/* 3 Büyük İstatistik Kartı */}
              <View style={styles.statsRow}>
                <View style={[styles.statBoxMini, { borderLeftColor: '#10B981' }]}>
                  <Text style={styles.statBoxLabelMini}>Aylık Ciro</Text>
                  <Text style={[styles.statBoxValueMini, { color: '#059669' }]}>
                    {monthTotalIncome.toLocaleString('tr-TR')} TL
                  </Text>
                </View>

                <View style={[styles.statBoxMini, { borderLeftColor: '#6366F1' }]}>
                  <Text style={styles.statBoxLabelMini}>Toplam Süre</Text>
                  <Text style={[styles.statBoxValueMini, { color: '#4F46E5' }]}>
                    {monthTotalHours} Saat
                  </Text>
                </View>
              </View>

              {/* Görünüm Modu Seçici (Öğrenci Bazlı / Kaynak Bazlı) */}
              <View style={styles.statsToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.statsToggleBtn,
                    statsViewMode === 'student' && styles.statsToggleBtnActive,
                  ]}
                  onPress={() => setStatsViewMode('student')}
                >
                  <Ionicons
                    name="person"
                    size={16}
                    color={statsViewMode === 'student' ? '#4F46E5' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.statsToggleBtnText,
                      statsViewMode === 'student' && styles.statsToggleBtnTextActive,
                    ]}
                  >
                    Öğrenci Bazlı ({studentBreakdown.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.statsToggleBtn,
                    statsViewMode === 'source' && styles.statsToggleBtnActive,
                  ]}
                  onPress={() => setStatsViewMode('source')}
                >
                  <Ionicons
                    name="wallet"
                    size={16}
                    color={statsViewMode === 'source' ? '#4F46E5' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.statsToggleBtnText,
                      statsViewMode === 'source' && styles.statsToggleBtnTextActive,
                    ]}
                  >
                    Kaynak Bazlı ({sourceBreakdown.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 1. ÖĞRENCİ BAZLI LİSTE */}
              {statsViewMode === 'student' && (
                <View>
                  <Text style={[styles.sectionHeaderTitle, { marginTop: 12, marginBottom: 10 }]}>
                    👤 Öğrenci Bazlı Hakediş
                  </Text>

                  {studentBreakdown.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Bu ay için henüz ders kaydı yok.</Text>
                    </View>
                  ) : (
                    studentBreakdown.map(([name, data]) => {
                      const percent = monthTotalIncome > 0 ? ((data.income / monthTotalIncome) * 100).toFixed(0) : 0;
                      return (
                        <View key={name} style={styles.breakdownCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={[styles.breakdownDot, { backgroundColor: data.color }]} />
                              <Text style={styles.breakdownName}>{name}</Text>
                            </View>
                            <Text style={styles.breakdownIncome}>
                              {data.income.toLocaleString('tr-TR')} TL
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                            <Text style={styles.breakdownSub}>
                              {data.count} ders • {data.hours} saat
                            </Text>
                            <Text style={styles.breakdownPercent}>%{percent}</Text>
                          </View>

                          {/* İlerleme Çubuğu */}
                          <View style={styles.progressBarBg}>
                            <View
                              style={[
                                styles.progressBarFill,
                                { width: `${percent}%`, backgroundColor: data.color },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {/* 2. KAYNAK BAZLI LİSTE (Elden, Kurs, Kozman vb.) */}
              {statsViewMode === 'source' && (
                <View>
                  <Text style={[styles.sectionHeaderTitle, { marginTop: 12, marginBottom: 10 }]}>
                    💳 Kaynak / Kanal Bazlı Dağılım
                  </Text>

                  {sourceBreakdown.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Bu ay için henüz kaynak verisi yok.</Text>
                    </View>
                  ) : (
                    sourceBreakdown.map(([srcName, data]) => {
                      const percent = monthTotalIncome > 0 ? ((data.income / monthTotalIncome) * 100).toFixed(0) : 0;
                      return (
                        <View key={srcName} style={styles.breakdownCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={[styles.breakdownDot, { backgroundColor: data.color }]} />
                              <Text style={styles.breakdownName}>{srcName}</Text>
                            </View>
                            <Text style={styles.breakdownIncome}>
                              {data.income.toLocaleString('tr-TR')} TL
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                            <Text style={styles.breakdownSub}>
                              {data.count} ders • {data.hours} saat
                            </Text>
                            <Text style={[styles.breakdownPercent, { color: data.color }]}>%{percent}</Text>
                          </View>

                          {/* İlerleme Çubuğu */}
                          <View style={styles.progressBarBg}>
                            <View
                              style={[
                                styles.progressBarFill,
                                { width: `${percent}%`, backgroundColor: data.color },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {/* HESAP & GÜVENLİK AYARLARI (Apple Store Zorunluluğu) */}
              <View style={styles.accountSettingsCard}>
                <Text style={styles.accountSettingsTitle}>⚙️ Hesap & Gizlilik</Text>
                <Text style={styles.accountSettingsSub}>
                  Giriş yapılan hesap: {session?.user?.email}
                </Text>

                <TouchableOpacity
                  style={styles.deleteAccountBtn}
                  onPress={handleDeleteAccount}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={styles.deleteAccountBtnText}>Hesabımı ve Tüm Verilerimi Sil</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* ALT TAB BAR */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('lessons')}>
          <Ionicons
            name={activeTab === 'lessons' ? 'calendar' : 'calendar-outline'}
            size={22}
            color={activeTab === 'lessons' ? '#4F46E5' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'lessons' && styles.tabTextActive]}>
            Dersler
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('students')}>
          <Ionicons
            name={activeTab === 'students' ? 'people' : 'people-outline'}
            size={22}
            color={activeTab === 'students' ? '#4F46E5' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'students' && styles.tabTextActive]}>
            Öğrenciler
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('stats')}>
          <Ionicons
            name={activeTab === 'stats' ? 'pie-chart' : 'pie-chart-outline'}
            size={22}
            color={activeTab === 'stats' ? '#4F46E5' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>
            Özet & Detay
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODAL: DERS EKLE / DÜZENLE */}
      <Modal visible={lessonModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingLesson ? 'Dersi Düzenle ✏️' : 'Yeni Ders Ekle ✨'}
              </Text>
              <TouchableOpacity onPress={() => setLessonModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Öğrenci Seçimi (Aramalı Dropdown / Select Menü) */}
            <Text style={styles.inputLabel}>Öğrenci Seç:</Text>

            {/* Seçili Öğrenci Kutusu */}
            <TouchableOpacity
              style={styles.dropdownSelector}
              onPress={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              {selectedStudent ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.chipDot, { backgroundColor: selectedStudent.color || '#3B82F6', width: 12, height: 12 }]} />
                  <Text style={styles.dropdownSelectedText}>
                    {selectedStudent.name} ({selectedStudent.hourly_rate} TL/saat)
                  </Text>
                </View>
              ) : (
                <Text style={{ color: '#94A3B8', fontSize: 14 }}>Bir öğrenci seçin...</Text>
              )}
              <Ionicons
                name={isDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#64748B"
              />
            </TouchableOpacity>

            {/* Açılır Arama Listesi */}
            {isDropdownOpen && (
              <View style={styles.dropdownListContainer}>
                {/* Arama Inputu */}
                <View style={styles.dropdownSearchWrapper}>
                  <Ionicons name="search" size={16} color="#94A3B8" />
                  <TextInput
                    style={styles.dropdownSearchInput}
                    placeholder="Öğrenci ara..."
                    value={studentSearchQuery}
                    onChangeText={setStudentSearchQuery}
                    placeholderTextColor="#94A3B8"
                    autoFocus
                  />
                  {studentSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setStudentSearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filtrelenmiş Öğrenci Listesi */}
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {students
                    .filter(s => s.is_active || (editingLesson && editingLesson.student_id === s.id))
                    .filter(s => s.name.toLowerCase().includes(studentSearchQuery.toLowerCase()))
                    .map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[
                          styles.dropdownItem,
                          selectedStudent?.id === s.id && styles.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setSelectedStudent(s);
                          setLessonRate(String(s.hourly_rate));
                          setIsDropdownOpen(false);
                          setStudentSearchQuery('');
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.chipDot, { backgroundColor: s.color || '#3B82F6' }]} />
                          <Text style={[styles.dropdownItemText, selectedStudent?.id === s.id && { fontWeight: '700', color: '#4F46E5' }]}>
                            {s.name}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: '#64748B' }}>
                          {s.hourly_rate} TL • {s.source}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}

            {/* Tarih Girişi */}
            <Text style={styles.inputLabel}>Tarih (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.input}
              value={lessonDate}
              onChangeText={setLessonDate}
              placeholder="2026-11-02"
              placeholderTextColor="#94A3B8"
            />

            {/* Ders Süresi */}
            <Text style={styles.inputLabel}>Ders Süresi (Saat):</Text>
            <View style={styles.hoursRow}>
              {['1', '1.5', '2', '3'].map((h) => (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourBtn, lessonHours === h && styles.hourBtnActive]}
                  onPress={() => setLessonHours(h)}
                >
                  <Text style={[styles.hourBtnText, lessonHours === h && styles.hourBtnTextActive]}>
                    {h} Saat
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Saatlik Ücret */}
            <Text style={styles.inputLabel}>Saatlik Ücret (TL):</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={lessonRate}
              onChangeText={setLessonRate}
              placeholderTextColor="#94A3B8"
            />

            {/* Not */}
            <Text style={styles.inputLabel}>Ders Notu (Opsiyonel):</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: Parabol konusu bitirildi"
              value={lessonNotes}
              onChangeText={setLessonNotes}
              placeholderTextColor="#94A3B8"
            />

            {/* Tutar Önizleme */}
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>
                Toplam: {((parseFloat(lessonHours) || 0) * (parseFloat(lessonRate) || 0)).toLocaleString('tr-TR')} TL
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSaveLesson}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingLesson ? 'Güncellemeyi Kaydet' : 'Dersi Kaydet'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: ÖĞRENCİ EKLE / DÜZENLE */}
      <Modal visible={studentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStudent ? 'Öğrenciyi Düzenle 👤' : 'Yeni Öğrenci Ekle 👤'}
              </Text>
              <TouchableOpacity onPress={() => setStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Öğrenci Adı Soyadı:</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: Tuana"
              value={studentName}
              onChangeText={setStudentName}
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>Saatlik Ücret (TL):</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={studentRate}
              onChangeText={setStudentRate}
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>Ödeme Kaynağı:</Text>
            <View style={styles.hoursRow}>
              {['Elden', 'Kurs', 'Kozman'].map((src) => (
                <TouchableOpacity
                  key={src}
                  style={[styles.hourBtn, studentSource === src && styles.hourBtnActive]}
                  onPress={() => setStudentSource(src)}
                >
                  <Text style={[styles.hourBtnText, studentSource === src && styles.hourBtnTextActive]}>
                    {src}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Aktif / Pasif Anahtarı */}
            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>Öğrenci Durumu (Aktif mi?):</Text>
              <Switch
                value={studentIsActive}
                onValueChange={setStudentIsActive}
                trackColor={{ false: '#EF4444', true: '#10B981' }}
              />
            </View>

            <Text style={styles.inputLabel}>Renk Belirle:</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 8 }}>
              {colorPalette.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    studentColor === c && styles.colorCircleSelected,
                  ]}
                  onPress={() => setStudentColor(c)}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: 16 }, submitting && { opacity: 0.6 }]}
              onPress={handleSaveStudent}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingStudent ? 'Değişiklikleri Kaydet' : 'Öğrenciyi Kaydet'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
    elevation: 3,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleBtnDark: {
    backgroundColor: '#334155',
  },
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 4,
  },
  dropdownSelectedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropdownListContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  dropdownSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  dropdownSearchInput: {
    flex: 1,
    marginLeft: 6,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 2,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  dropdownItemActive: {
    backgroundColor: '#EEF2FF',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#334155',
  },
  accountSettingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  accountSettingsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  accountSettingsSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 14,
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  deleteAccountBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  monthSelectorBar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  monthScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  monthChipActive: {
    backgroundColor: '#4F46E5',
  },
  monthChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dateFilterContainer: {
    marginBottom: 10,
  },
  dateFilterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  clearFilterText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  dayBadge: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 6,
    minWidth: 54,
  },
  dayBadgeActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  dayBadgeNum: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  dayBadgeNumActive: {
    color: '#FFFFFF',
  },
  dayBadgeCount: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  dayBadgeCountActive: {
    color: '#E0E7FF',
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  colorBadge: {
    width: 5,
    height: 48,
    borderRadius: 4,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  lessonDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  lessonNotes: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
    fontStyle: 'italic',
  },
  lessonPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  sourceTag: {
    fontSize: 10,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  actionButtonsCol: {
    flexDirection: 'column',
    gap: 8,
    paddingLeft: 4,
  },
  actionIconBtn: {
    padding: 4,
  },
  studentFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  studentFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentFilterBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  studentFilterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  studentFilterBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  newStudentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
  },
  newStudentBtnText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 14,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  passiveCard: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
  },
  studentCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  studentCardDetail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  editStudentBtn: {
    padding: 6,
  },
  quickAddLessonBtn: {
    padding: 4,
  },
  statsHeaderBox: {
    backgroundColor: '#4F46E5',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  statsMonthTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statsMonthSub: {
    fontSize: 12,
    color: '#C7D2FE',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  statBoxMini: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
  },
  statBoxLabelMini: {
    fontSize: 12,
    color: '#64748B',
  },
  statBoxValueMini: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  statsToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 4,
    marginVertical: 12,
    gap: 4,
  },
  statsToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  statsToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statsToggleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  statsToggleBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  breakdownDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  breakdownName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  breakdownIncome: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  breakdownSub: {
    fontSize: 12,
    color: '#64748B',
  },
  breakdownPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 10,
  },
  tabItem: {
    alignItems: 'center',
    gap: 4,
  },
  tabText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  loadingText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  studentChips: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    marginRight: 6,
    gap: 6,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 4,
  },
  hourBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  hourBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  hourBtnText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  hourBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  previewBox: {
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  previewText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
  },
  saveBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  colorCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#0F172A',
  },
});
