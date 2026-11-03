export interface Student {
  id: string;
  name: string;
  hourly_rate: number;
  currency: string;
  color: string;
  source: string;
  phone?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface Lesson {
  id: string;
  student_id: string;
  lesson_date: string;
  hours: number;
  hourly_rate: number;
  notes?: string | null;
  created_at?: string;
  students?: Student;
}

export interface Payment {
  id: string;
  student_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes?: string | null;
  created_at?: string;
  students?: Student;
}

