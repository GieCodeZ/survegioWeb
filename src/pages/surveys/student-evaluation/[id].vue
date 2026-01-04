<script setup lang="ts">
import { $api } from '@/utils/api'
import { YEAR_LEVEL_OPTIONS } from '@/utils/constants'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
    allowedRoles: ['administrator'],
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
}

interface StudentQuestion {
  id?: number
  question: string
  sort?: number
}

interface StudentSurveyGroup {
  id?: number
  number: number
  title: string
  response_style: string
  questions?: StudentQuestion[]
}

interface SurveyForm {
  id?: number
  title: string
  instruction: string
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: number | null
  evaluation_type: 'Class' | 'Office'
  office_id: number | null
  assignment_mode: 'all' | 'department' | 'specific'
  student_percentage: number
  target_year_levels: string[]
  question_group: StudentSurveyGroup[]
}

interface Student {
  id: number
  first_name: string
  last_name: string
  student_number: string
}

interface SurveyAnswer {
  id: number
  question_id: number | StudentQuestion
  answer_value: string
}

interface SurveyResponse {
  id: number
  survey_id: number
  student_id: Student | number
  class_id?: number
  office_id?: number | { id: number; name: string }
  submitted_at: string
  year_level?: string
  answers?: SurveyAnswer[]
}

interface QuestionStats {
  questionId: number
  questionText: string
  responseStyle: string
  totalResponses: number
  average?: number
  distribution?: Record<string, number>
}

interface ClassItem {
  id: number
  section: string
  course_id?: { id: number; courseCode: string; courseName: string } | number | null
  teacher_id?: { id: number; first_name: string; last_name: string } | number | null
  acadTerm_id?: { id: number; schoolYear: string; semester: string } | number | null
  student_id?: { id: number }[]
  year_level?: string
}

interface SchoolOffice {
  id: number
  name: string
  description?: string
  is_active?: boolean
}

interface StudentItem {
  id: number
  first_name: string
  last_name: string
  student_number: string
  email?: string
  deparment_id?: number
  year_level?: string
}

interface DepartmentOption {
  id: number
  name: string
  programCode?: string
}

interface ClassEvaluationData {
  classId: number
  section: string
  courseCode: string
  courseName: string
  totalRespondents: number
  totalStudents: number
  responseRate: number
  overallAverage: number
  questionStats: {
    groupTitle: string
    questions: {
      questionText: string
      average: number
      distribution: Record<string, number>
      totalResponses: number
    }[]
  }[]
  comments: string[]
}

interface InstructorReportData {
  instructorId: number
  instructorName: string
  academicTerm: string
  totalClasses: number
  totalRespondents: number
  totalStudents: number
  overallAverage: number
  responseRate: number
  classes: ClassEvaluationData[]
}

interface OfficeReportData {
  officeId: number
  officeName: string
  surveyTitle: string
  academicTerm: string
  totalRespondents: number
  totalExpected: number
  responseRate: number
  overallAverage: number
  questionStats: {
    groupTitle: string
    questions: {
      questionText: string
      average: number
      distribution: Record<string, number>
      totalResponses: number
    }[]
  }[]
  comments: string[]
  responses: {
    studentName: string
    studentNumber: string
    program: string
    submittedAt: string
    answers: {
      groupTitle: string
      questionText: string
      answerValue: string
      responseStyle: string
    }[]
  }[]
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number((route.params as { id: string }).id))

// State
const activeTab = ref<'edit' | 'assignment' | 'responses'>('edit')
const isLoading = ref(true)
const isSaving = ref(false)
const isLoadingResponses = ref(false)
const isLoadingClasses = ref(false)
const isLoadingStudents = ref(false)
const academicTerms = ref<AcademicTerm[]>([])
const schoolOffices = ref<SchoolOffice[]>([])
const responses = ref<SurveyResponse[]>([])
const questionStats = ref<QuestionStats[]>([])

// Export report state
const isExportDialogOpen = ref(false)
const isGeneratingReport = ref(false)
const selectedInstructorForExport = ref<number | null>(null)
const currentInstructorReport = ref<InstructorReportData | null>(null)

// Office export state
const isOfficeExportDialogOpen = ref(false)
const currentOfficeReport = ref<OfficeReportData | null>(null)

// Class assignment state (for class-based surveys)
const availableClasses = ref<ClassItem[]>([])
const assignedClassIds = ref<number[]>([])
const classSearch = ref('')

// Student assignment state (for office-based surveys)
const availableStudents = ref<StudentItem[]>([])
const assignedStudentIds = ref<number[]>([])
const studentSearch = ref('')

// Year level filter state for assignment tab
const classYearLevelFilter = ref<number | null>(null)
const studentYearLevelFilter = ref<number | null>(null)

// Department assignment state (for office-based surveys by department)
const availableDepartments = ref<DepartmentOption[]>([])
const assignedDepartmentIds = ref<number[]>([])

const form = ref<SurveyForm>({
  title: '',
  instruction: '',
  survey_start: '',
  survey_end: '',
  is_active: 'Draft',
  academic_term_id: null,
  evaluation_type: 'Class',
  office_id: null,
  assignment_mode: 'all',
  student_percentage: 100,
  target_year_levels: [],
  question_group: [],
})

// Date picker menu state
const startDateMenu = ref(false)
const endDateMenu = ref(false)

// Options
const statusOptions = [
  { title: 'Draft', value: 'Draft' },
  { title: 'Active', value: 'Active' },
  { title: 'Archived', value: 'Archived' },
]

const evaluationTypeOptions = [
  { title: 'Class', value: 'Class' },
  { title: 'Office', value: 'Office' },
]

const assignmentModeOptions = [
  { title: 'All Students', value: 'all' },
  { title: 'By Department', value: 'department' },
  { title: 'Specific Students', value: 'specific' },
]

const responseStyleOptions = ref<{ title: string; value: string }[]>([])

// Table headers for responses
const professorTableHeaders = [
  { title: 'Professor Name', key: 'name', sortable: true },
  { title: 'Classes', key: 'classCount', sortable: true, align: 'center' as const },
  { title: 'Responses', key: 'responseCount', sortable: true, align: 'center' as const },
  { title: 'Avg Rating', key: 'averageRating', sortable: true, align: 'center' as const },
]

const officeTableHeaders = [
  { title: 'Office Name', key: 'name', sortable: true },
  { title: 'Responses', key: 'responseCount', sortable: true, align: 'center' as const },
  { title: 'Avg Rating', key: 'averageRating', sortable: true, align: 'center' as const },
]

// Fetch response style options from Directus
const fetchResponseStyleOptions = async () => {
  try {
    const res = await $api('/fields/StudentSurveyGroup/response_style')
    const choices = res.data?.meta?.options?.choices || []
    responseStyleOptions.value = choices.map((choice: { text: string; value: string }) => ({
      title: choice.text,
      value: choice.value,
    }))
  }
  catch (error) {
    console.error('Failed to fetch response style options:', error)
    // Fallback to default options
    responseStyleOptions.value = [
      { title: 'Rating-Scale Questions', value: 'Rating-Scale Questions' },
      { title: 'Open-Ended Question', value: 'Open-Ended Quesrion' },
    ]
  }
}

// Format datetime for input field (YYYY-MM-DDTHH:mm)
const formatDateForInput = (dateStr: string | null): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }
  catch {
    return ''
  }
}

// Format date for display
const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  catch {
    return dateStr
  }
}

// Get year level display text
const getYearLevelDisplay = (yearLevel: string | undefined): string => {
  if (!yearLevel) return '-'
  return yearLevel
}

// Date picker computed properties
const startDateValue = computed({
  get: () => form.value.survey_start ? new Date(form.value.survey_start) : null,
  set: (val: Date | null) => {
    if (val) {
      const existing = form.value.survey_start ? new Date(form.value.survey_start) : null
      if (existing) {
        val.setHours(existing.getHours(), existing.getMinutes())
      }
      form.value.survey_start = val.toISOString()
    }
    else {
      form.value.survey_start = ''
    }
  },
})

const endDateValue = computed({
  get: () => form.value.survey_end ? new Date(form.value.survey_end) : null,
  set: (val: Date | null) => {
    if (val) {
      const existing = form.value.survey_end ? new Date(form.value.survey_end) : null
      if (existing) {
        val.setHours(existing.getHours(), existing.getMinutes())
      }
      else {
        val.setHours(23, 59)
      }
      form.value.survey_end = val.toISOString()
    }
    else {
      form.value.survey_end = ''
    }
  },
})

const startTimeValue = computed({
  get: () => {
    if (!form.value.survey_start) return '00:00'
    const date = new Date(form.value.survey_start)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },
  set: (val: string) => {
    if (!form.value.survey_start) {
      const now = new Date()
      form.value.survey_start = now.toISOString()
    }
    const [hours, minutes] = val.split(':').map(Number)
    const date = new Date(form.value.survey_start)
    date.setHours(hours, minutes)
    form.value.survey_start = date.toISOString()
  },
})

const endTimeValue = computed({
  get: () => {
    if (!form.value.survey_end) return '23:59'
    const date = new Date(form.value.survey_end)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },
  set: (val: string) => {
    if (!form.value.survey_end) {
      const now = new Date()
      form.value.survey_end = now.toISOString()
    }
    const [hours, minutes] = val.split(':').map(Number)
    const date = new Date(form.value.survey_end)
    date.setHours(hours, minutes)
    form.value.survey_end = date.toISOString()
  },
})

// Fetch academic terms (only active)
const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        filter: { status: { _eq: 'Active' } },
        sort: '-schoolYear',
      },
    })
    academicTerms.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

// Fetch survey details
const fetchSurveyDetails = async () => {
  isLoading.value = true
  try {
    const res = await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['*', 'academic_term_id.*', 'office_id.*', 'question_group.*', 'question_group.questions.*'],
      },
    })

    const data = res.data

    // Extract academic term ID
    const acadTermId = typeof data.academic_term_id === 'object' && data.academic_term_id !== null
      ? data.academic_term_id.id
      : data.academic_term_id

    // Extract office ID
    const officeId = typeof data.office_id === 'object' && data.office_id !== null
      ? data.office_id.id
      : data.office_id

    // Map question groups
    const questionGroups: StudentSurveyGroup[] = (data.question_group || []).map((group: any, index: number) => ({
      id: group.id,
      number: group.number || index + 1,
      title: group.title || '',
      response_style: group.response_style || 'Rating-Scale Questions',
      questions: (group.questions || []).map((q: any) => ({
        id: q.id,
        question: q.question || '',
        sort: q.sort,
      })),
    }))

    form.value = {
      id: data.id,
      title: data.title || '',
      instruction: data.instruction || '',
      survey_start: formatDateForInput(data.survey_start),
      survey_end: formatDateForInput(data.survey_end),
      is_active: data.is_active || 'Draft',
      academic_term_id: acadTermId,
      evaluation_type: data.evaluation_type || 'Class',
      office_id: officeId || null,
      assignment_mode: data.assignment_mode || 'all',
      student_percentage: data.student_percentage ?? 100,
      target_year_levels: data.target_year_levels || [],
      question_group: questionGroups,
    }
  }
  catch (error) {
    console.error('Failed to fetch survey details:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch survey responses
const fetchResponses = async () => {
  isLoadingResponses.value = true
  try {
    const res = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { survey_id: { _eq: surveyId.value } },
        fields: ['*', 'year_level', 'student_id.*', 'answers.*', 'answers.question_id.*'],
        sort: ['-submitted_at'],
      },
    })
    responses.value = res.data || []
    calculateStats()
  }
  catch (error) {
    console.error('Failed to fetch responses:', error)
    responses.value = []
  }
  finally {
    isLoadingResponses.value = false
  }
}

// Calculate statistics for each question
const calculateStats = () => {
  const stats: QuestionStats[] = []

  // Get all questions from the form
  for (const group of form.value.question_group) {
    for (const question of group.questions || []) {
      if (!question.id) continue

      const questionAnswers: string[] = []

      // Collect all answers for this question
      for (const response of responses.value) {
        if (!response.answers) continue
        for (const answer of response.answers) {
          const answerQuestionId = typeof answer.question_id === 'object'
            ? answer.question_id.id
            : answer.question_id
          if (answerQuestionId === question.id) {
            questionAnswers.push(answer.answer_value)
          }
        }
      }

      const stat: QuestionStats = {
        questionId: question.id,
        questionText: question.question,
        responseStyle: group.response_style,
        totalResponses: questionAnswers.length,
      }

      // Calculate based on response style
      if ((group.response_style === 'Rating-Scale Questions' || group.response_style === 'Rating-Scale Questions') && questionAnswers.length > 0) {
        const numericAnswers = questionAnswers.map(a => parseFloat(a)).filter(n => !isNaN(n))
        if (numericAnswers.length > 0) {
          stat.average = numericAnswers.reduce((a, b) => a + b, 0) / numericAnswers.length
          stat.distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
          for (const val of numericAnswers) {
            const key = Math.round(val).toString()
            if (stat.distribution[key] !== undefined) {
              stat.distribution[key]++
            }
          }
        }
      }

      stats.push(stat)
    }
  }

  questionStats.value = stats
}

// Helper: Check if response style is for comments
const isCommentStyle = (responseStyle: string): boolean => {
  if (!responseStyle) return false
  const lower = responseStyle.toLowerCase()
  return lower.includes('comment')
}

// Helper: Extract comments from Comment response style answers in responses
const extractCommentsFromResponses = (responsesList: SurveyResponse[]): string[] => {
  const comments: string[] = []

  for (const response of responsesList) {
    if (!response.answers) continue

    for (const answer of response.answers) {
      if (!answer.answer_value || answer.answer_value.trim() === '') continue

      // Find the question to get its response style
      const qId = typeof answer.question_id === 'object' ? answer.question_id.id : answer.question_id

      for (const group of form.value.question_group) {
        for (const question of group.questions || []) {
          if (question.id === qId && isOpenEndedStyle(group.response_style)) {
            comments.push(answer.answer_value.trim())
          }
        }
      }
    }
  }

  return comments
}

// Fetch available classes
const fetchClasses = async () => {
  isLoadingClasses.value = true
  try {
    const res = await $api('/items/classes', {
      params: {
        fields: ['*', 'course_id.*', 'teacher_id.*', 'acadTerm_id.*', 'student_id.id'],
        sort: ['section'],
        limit: -1,
      },
    })
    availableClasses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch classes:', error)
    availableClasses.value = []
  }
  finally {
    isLoadingClasses.value = false
  }
}

// Fetch assigned classes for this survey (M2M junction table)
const fetchAssignedClasses = async () => {
  try {
    const res = await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['classes.classes_id.id'],
      },
    })
    // M2M returns junction objects: [{ classes_id: { id: 6 } }, ...]
    const classes = res.data?.classes || []
    assignedClassIds.value = classes.map((c: any) => {
      if (typeof c?.classes_id === 'object' && c?.classes_id !== null) {
        return c.classes_id.id
      }
      if (typeof c?.classes_id === 'number') {
        return c.classes_id
      }
      return null
    }).filter((id: any) => id != null)
  }
  catch (error) {
    console.error('Failed to fetch assigned classes:', error)
    assignedClassIds.value = []
  }
}

// Fetch school offices
const fetchSchoolOffices = async () => {
  try {
    const res = await $api('/items/SchoolOffices', {
      params: {
        filter: { is_active: { _eq: true } },
        sort: ['name'],
      },
    })
    schoolOffices.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch school offices:', error)
    schoolOffices.value = []
  }
}

// Fetch available students (for office-based surveys)
const fetchStudents = async () => {
  isLoadingStudents.value = true
  try {
    const res = await $api('/items/students', {
      params: {
        fields: ['id', 'first_name', 'last_name', 'student_number', 'email', 'deparment_id', 'year_level'],
        sort: ['last_name', 'first_name'],
        limit: -1,
      },
    })
    availableStudents.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch students:', error)
    availableStudents.value = []
  }
  finally {
    isLoadingStudents.value = false
  }
}

// Fetch assigned students for this survey (M2M junction table)
const fetchAssignedStudents = async () => {
  try {
    const res = await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['students.students_id'],
      },
    })
    // M2M returns junction objects: [{ students_id: 36 }, ...]
    const students = res.data?.students || []
    assignedStudentIds.value = students.map((s: any) => {
      if (typeof s?.students_id === 'object' && s?.students_id !== null) {
        return s.students_id.id
      }
      if (typeof s?.students_id === 'number') {
        return s.students_id
      }
      return null
    }).filter((id: any) => id != null)
  }
  catch (error) {
    console.error('Failed to fetch assigned students:', error)
    assignedStudentIds.value = []
  }
}

// Fetch available departments (for office-based surveys by department)
const fetchDepartments = async () => {
  try {
    const res = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.id', 'name.programName', 'name.programCode'],
        sort: ['name.programName'],
      },
    })
    availableDepartments.value = (res.data || []).map((dept: any) => ({
      id: dept.id,
      name: typeof dept.name === 'object' && dept.name ? dept.name.programName : `Department #${dept.id}`,
      programCode: typeof dept.name === 'object' && dept.name ? dept.name.programCode : '',
    }))
  }
  catch (error) {
    console.error('Failed to fetch departments:', error)
    availableDepartments.value = []
  }
}

// Filtered classes based on search and year level
const filteredClasses = computed(() => {
  let result = availableClasses.value

  // Apply year level filter
  if (classYearLevelFilter.value) {
    result = result.filter(c => c.year_level === classYearLevelFilter.value)
  }

  // Apply search filter
  if (classSearch.value) {
    const search = classSearch.value.toLowerCase()
    result = result.filter(c => {
      const section = c.section?.toLowerCase() || ''
      const courseCode = typeof c.course_id === 'object' && c.course_id ? c.course_id.courseCode?.toLowerCase() || '' : ''
      const courseName = typeof c.course_id === 'object' && c.course_id ? c.course_id.courseName?.toLowerCase() || '' : ''
      const teacherName = typeof c.teacher_id === 'object' && c.teacher_id ? `${c.teacher_id.first_name} ${c.teacher_id.last_name}`.toLowerCase() : ''
      return section.includes(search) || courseCode.includes(search) || courseName.includes(search) || teacherName.includes(search)
    })
  }

  return result
})

// Toggle class assignment
const toggleClassAssignment = (classId: number) => {
  const index = assignedClassIds.value.indexOf(classId)
  if (index === -1) {
    assignedClassIds.value.push(classId)
  }
  else {
    assignedClassIds.value.splice(index, 1)
  }
}

// Check if class is assigned
const isClassAssigned = (classId: number): boolean => {
  return assignedClassIds.value.includes(classId)
}

// Get class display name
const getClassDisplayName = (c: ClassItem): string => {
  const section = c.section || `Class #${c.id}`
  if (typeof c.course_id === 'object' && c.course_id) {
    return `${c.course_id.courseCode} - ${section}`
  }
  return section
}

// Get class subtitle (course name and teacher)
const getClassSubtitle = (c: ClassItem): string => {
  const parts: string[] = []
  if (typeof c.course_id === 'object' && c.course_id?.courseName) {
    parts.push(c.course_id.courseName)
  }
  if (typeof c.teacher_id === 'object' && c.teacher_id) {
    parts.push(`${c.teacher_id.first_name} ${c.teacher_id.last_name}`)
  }
  return parts.join(' | ')
}

// Get student count for a class
const getStudentCount = (c: ClassItem): number => {
  return c.student_id?.length || 0
}

// Get total assigned students
const totalAssignedStudents = computed(() => {
  return availableClasses.value
    .filter(c => assignedClassIds.value.includes(c.id))
    .reduce((total, c) => total + getStudentCount(c), 0)
})

// Get estimated students after percentage applied
const estimatedStudentsAfterPercentage = computed(() => {
  const total = totalAssignedStudents.value
  const percentage = form.value.student_percentage
  return Math.ceil(total * (percentage / 100))
})

// Select all classes
const selectAllClasses = () => {
  assignedClassIds.value = availableClasses.value.map(c => c.id)
}

// Deselect all classes
const deselectAllClasses = () => {
  assignedClassIds.value = []
}

// ==================== STUDENT ASSIGNMENT HELPERS (for office-based surveys) ====================

// Filtered students based on search and year level (search by student number only for privacy)
const filteredStudents = computed(() => {
  let result = availableStudents.value

  // Apply year level filter
  if (studentYearLevelFilter.value) {
    result = result.filter(s => s.year_level === studentYearLevelFilter.value)
  }

  // Apply search filter
  if (studentSearch.value) {
    const search = studentSearch.value.toLowerCase()
    result = result.filter(s => {
      const studentNumber = s.student_number?.toLowerCase() || ''
      return studentNumber.includes(search)
    })
  }

  return result
})

// Toggle student assignment
const toggleStudentAssignment = (studentId: number) => {
  const index = assignedStudentIds.value.indexOf(studentId)
  if (index === -1) {
    assignedStudentIds.value.push(studentId)
  }
  else {
    assignedStudentIds.value.splice(index, 1)
  }
}

// Check if student is assigned
const isStudentAssigned = (studentId: number): boolean => {
  return assignedStudentIds.value.includes(studentId)
}

// Get student display - only student number (hide name for privacy)
const getStudentDisplayNumber = (s: StudentItem): string => {
  return s.student_number || `ID: ${s.id}`
}

// Get department name for a student
const getStudentDepartmentName = (s: StudentItem): string => {
  if (!s.deparment_id) return 'No Department'
  const dept = availableDepartments.value.find(d => d.id === s.deparment_id)
  return dept ? (dept.programCode ? `${dept.programCode} - ${dept.name}` : dept.name) : 'Unknown Department'
}

// Total assigned students for office-based surveys
const totalAssignedStudentsForOffice = computed(() => {
  if (form.value.assignment_mode === 'all') {
    return availableStudents.value.length
  }
  if (form.value.assignment_mode === 'department') {
    // Count students in selected departments
    return availableStudents.value.filter(s =>
      assignedDepartmentIds.value.includes(s.deparment_id || 0),
    ).length
  }
  return assignedStudentIds.value.length
})

// Select all students
const selectAllStudents = () => {
  assignedStudentIds.value = availableStudents.value.map(s => s.id)
}

// Deselect all students
const deselectAllStudents = () => {
  assignedStudentIds.value = []
}

// ==================== DEPARTMENT ASSIGNMENT HELPERS ====================

// Toggle department assignment
const toggleDepartmentAssignment = (deptId: number) => {
  const index = assignedDepartmentIds.value.indexOf(deptId)
  if (index === -1) {
    assignedDepartmentIds.value.push(deptId)
  }
  else {
    assignedDepartmentIds.value.splice(index, 1)
  }
}

// Check if department is assigned
const isDepartmentAssigned = (deptId: number): boolean => {
  return assignedDepartmentIds.value.includes(deptId)
}

// Get student count for a department
const getStudentCountByDepartment = (deptId: number): number => {
  return availableStudents.value.filter(s => s.deparment_id === deptId).length
}

// Select all departments
const selectAllDepartments = () => {
  assignedDepartmentIds.value = availableDepartments.value.map(d => d.id)
}

// Deselect all departments
const deselectAllDepartments = () => {
  assignedDepartmentIds.value = []
}

// Total expected students for this survey
const totalExpectedStudents = computed(() => {
  if (form.value.evaluation_type === 'Class') {
    return totalAssignedStudents.value
  }
  return totalAssignedStudentsForOffice.value
})

// Pending responses count
const pendingResponsesCount = computed(() => {
  return Math.max(0, totalExpectedStudents.value - responses.value.length)
})

// Pending responses by program/department
const pendingByProgram = computed(() => {
  // Get all assigned student IDs
  let assignedStudents: StudentItem[] = []

  if (form.value.evaluation_type === 'Class') {
    // Get students from assigned classes
    const assignedClassItems = availableClasses.value.filter(c => assignedClassIds.value.includes(c.id))
    const studentIdsInClasses = new Set<number>()
    for (const classItem of assignedClassItems) {
      if (classItem.student_id) {
        for (const s of classItem.student_id) {
          studentIdsInClasses.add(s.id)
        }
      }
    }
    assignedStudents = availableStudents.value.filter(s => studentIdsInClasses.has(s.id))
  }
  else {
    // Office-based
    if (form.value.assignment_mode === 'all') {
      assignedStudents = availableStudents.value
    }
    else if (form.value.assignment_mode === 'department') {
      assignedStudents = availableStudents.value.filter(s =>
        assignedDepartmentIds.value.includes(s.deparment_id || 0),
      )
    }
    else {
      assignedStudents = availableStudents.value.filter(s =>
        assignedStudentIds.value.includes(s.id),
      )
    }
  }

  // Get IDs of students who have responded
  const respondedStudentIds = new Set(
    responses.value.map(r => {
      if (typeof r.student_id === 'object' && r.student_id !== null) {
        return r.student_id.id
      }
      return r.student_id as number
    }),
  )

  // Find students who haven't responded and group by department
  const pendingStudents = assignedStudents.filter(s => !respondedStudentIds.has(s.id))

  // Group by department
  const byDepartment: Record<number, { name: string; count: number }> = {}
  for (const student of pendingStudents) {
    const deptId = student.deparment_id || 0
    if (!byDepartment[deptId]) {
      const dept = availableDepartments.value.find(d => d.id === deptId)
      byDepartment[deptId] = {
        name: dept ? (dept.programCode ? `${dept.programCode} - ${dept.name}` : dept.name) : 'No Program',
        count: 0,
      }
    }
    byDepartment[deptId].count++
  }

  // Convert to array and sort by count descending
  return Object.entries(byDepartment)
    .map(([id, data]) => ({ id: Number(id), ...data }))
    .sort((a, b) => b.count - a.count)
})

// ==================== YEAR LEVEL ANALYTICS ====================

// Responses grouped by year level
const responsesByYearLevel = computed(() => {
  const stats: Record<string, {
    yearLevel: string
    yearLevelLabel: string
    totalResponses: number
    averageRating: number
    ratingSum: number
    ratingCount: number
  }> = {}

  // Initialize for all year levels
  for (const opt of YEAR_LEVEL_OPTIONS) {
    stats[opt.value] = {
      yearLevel: opt.value,
      yearLevelLabel: opt.title,
      totalResponses: 0,
      averageRating: 0,
      ratingSum: 0,
      ratingCount: 0,
    }
  }

  // Count responses by year level (use year_level stored directly on response)
  for (const response of responses.value) {
    // Use year_level from response if available, fallback to looking up student
    let yearLevel = response.year_level || ''

    // Fallback: if no year_level on response, try to look up from student
    if (!yearLevel) {
      const student = typeof response.student_id === 'object' ? response.student_id : null
      if (student) {
        const studentItem = availableStudents.value.find(s => s.id === student.id)
        yearLevel = studentItem?.year_level || ''
      }
    }

    if (yearLevel && stats[yearLevel]) {
      stats[yearLevel].totalResponses++

      // Calculate rating from answers
      if (response.answers) {
        for (const answer of response.answers) {
          const numVal = parseFloat(answer.answer_value)
          if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
            stats[yearLevel].ratingSum += numVal
            stats[yearLevel].ratingCount++
          }
        }
      }
    }
  }

  // Calculate averages
  for (const key of Object.keys(stats)) {
    const stat = stats[key]
    if (stat.ratingCount > 0) {
      stat.averageRating = stat.ratingSum / stat.ratingCount
    }
  }

  return Object.values(stats).filter(s => s.totalResponses > 0)
})

// ==================== EXPORT REPORT FUNCTIONS ====================

// Get classes that have responses
const classesWithResponses = computed(() => {
  const classIds = new Set<number>()
  for (const response of responses.value) {
    if (response.class_id) {
      classIds.add(response.class_id)
    }
  }
  return availableClasses.value.filter(c => classIds.has(c.id))
})

// Get unique instructors from classes with responses
const instructorsWithResponses = computed(() => {
  const instructorMap = new Map<number, {
    id: number
    name: string
    classCount: number
    responseCount: number
    classIds: number[]
  }>()

  for (const classItem of classesWithResponses.value) {
    if (typeof classItem.teacher_id === 'object' && classItem.teacher_id) {
      const teacherId = classItem.teacher_id.id
      const teacherName = `${classItem.teacher_id.first_name} ${classItem.teacher_id.last_name}`

      const responseCount = responses.value.filter(r => r.class_id === classItem.id).length

      if (instructorMap.has(teacherId)) {
        const existing = instructorMap.get(teacherId)!
        existing.classCount++
        existing.responseCount += responseCount
        existing.classIds.push(classItem.id)
      }
      else {
        instructorMap.set(teacherId, {
          id: teacherId,
          name: teacherName,
          classCount: 1,
          responseCount,
          classIds: [classItem.id],
        })
      }
    }
  }

  // Calculate average rating for each instructor
  return Array.from(instructorMap.values()).map((instructor) => {
    // Get all responses for this instructor's classes
    const instructorResponses = responses.value.filter(r => instructor.classIds.includes(r.class_id || 0))

    // Calculate overall average from all numeric answers
    let totalSum = 0
    let totalCount = 0

    for (const response of instructorResponses) {
      if (!response.answers) continue
      for (const answer of response.answers) {
        const numVal = parseFloat(answer.answer_value)
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
          totalSum += numVal
          totalCount++
        }
      }
    }

    return {
      id: instructor.id,
      name: instructor.name,
      classCount: instructor.classCount,
      responseCount: instructor.responseCount,
      averageRating: totalCount > 0 ? totalSum / totalCount : 0,
      classIds: instructor.classIds,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
})

// Get offices with responses (for Office evaluations)
const officesWithResponses = computed(() => {
  if (form.value.evaluation_type !== 'Office') return []

  const officeMap = new Map<number, {
    id: number
    name: string
    responseCount: number
    ratingSum: number
    ratingCount: number
  }>()

  for (const response of responses.value) {
    let officeId: number | null = null
    let officeName = ''

    if (typeof response.office_id === 'object' && response.office_id) {
      officeId = response.office_id.id
      officeName = response.office_id.name
    }
    else if (typeof response.office_id === 'number') {
      officeId = response.office_id
      const office = schoolOffices.value.find(o => o.id === officeId)
      officeName = office?.name || `Office #${officeId}`
    }

    if (!officeId) continue

    // Calculate rating from answers
    let responseRatingSum = 0
    let responseRatingCount = 0
    if (response.answers) {
      for (const answer of response.answers) {
        const numVal = parseFloat(answer.answer_value)
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
          responseRatingSum += numVal
          responseRatingCount++
        }
      }
    }

    if (officeMap.has(officeId)) {
      const existing = officeMap.get(officeId)!
      existing.responseCount++
      existing.ratingSum += responseRatingSum
      existing.ratingCount += responseRatingCount
    }
    else {
      officeMap.set(officeId, {
        id: officeId,
        name: officeName,
        responseCount: 1,
        ratingSum: responseRatingSum,
        ratingCount: responseRatingCount,
      })
    }
  }

  return Array.from(officeMap.values()).map(office => ({
    id: office.id,
    name: office.name,
    responseCount: office.responseCount,
    averageRating: office.ratingCount > 0 ? office.ratingSum / office.ratingCount : 0,
  })).sort((a, b) => a.name.localeCompare(b.name))
})


// Navigate to professor detail page
const openProfessorDetail = (professor: { id: number }) => {
  router.push(`/surveys/student-evaluation/professor-${surveyId.value}-${professor.id}`)
}

// Navigate to office detail page
const openOfficeDetail = (office: { id: number }) => {
  router.push(`/surveys/student-evaluation/office-${surveyId.value}-${office.id}`)
}

// Generate report data for a specific class (returns ClassEvaluationData)
const generateClassEvaluationData = (classId: number): ClassEvaluationData | null => {
  const classItem = availableClasses.value.find(c => c.id === classId)
  if (!classItem) return null

  // Get responses for this class
  const classResponses = responses.value.filter(r => r.class_id === classId)
  if (classResponses.length === 0) return null

  // Get class info
  const section = classItem.section || `Class #${classId}`
  const courseCode = typeof classItem.course_id === 'object' && classItem.course_id ? classItem.course_id.courseCode : ''
  const courseName = typeof classItem.course_id === 'object' && classItem.course_id ? classItem.course_id.courseName : ''

  const totalStudents = classItem.student_id?.length || 0
  const totalRespondents = classResponses.length
  const responseRate = totalStudents > 0 ? Math.round((totalRespondents / totalStudents) * 100) : 0

  // Calculate statistics per question group
  const questionStatsData: ClassEvaluationData['questionStats'] = []
  let totalSum = 0
  let totalCount = 0

  for (const group of form.value.question_group) {
    const groupStats: ClassEvaluationData['questionStats'][0] = {
      groupTitle: group.title || `Group ${group.number}`,
      questions: [],
    }

    for (const question of group.questions || []) {
      if (!question.id) continue

      // Get answers for this question from class responses
      const answers: number[] = []
      for (const response of classResponses) {
        if (!response.answers) continue
        for (const answer of response.answers) {
          const answerQuestionId = typeof answer.question_id === 'object'
            ? answer.question_id.id
            : answer.question_id
          if (answerQuestionId === question.id) {
            const numVal = parseFloat(answer.answer_value)
            if (!isNaN(numVal)) {
              answers.push(numVal)
            }
          }
        }
      }

      if (answers.length > 0) {
        const avg = answers.reduce((a, b) => a + b, 0) / answers.length
        const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
        for (const val of answers) {
          const key = Math.round(val).toString()
          if (distribution[key] !== undefined) {
            distribution[key]++
          }
        }

        groupStats.questions.push({
          questionText: question.question,
          average: avg,
          distribution,
          totalResponses: answers.length,
        })

        totalSum += avg * answers.length
        totalCount += answers.length
      }
    }

    if (groupStats.questions.length > 0) {
      questionStatsData.push(groupStats)
    }
  }

  const overallAverage = totalCount > 0 ? totalSum / totalCount : 0

  // Collect comments from Open-Ended question answers
  const comments = extractCommentsFromResponses(classResponses)

  return {
    classId,
    section,
    courseCode,
    courseName,
    totalRespondents,
    totalStudents,
    responseRate,
    overallAverage,
    questionStats: questionStatsData,
    comments,
  }
}

// Generate instructor report with all their classes
const generateInstructorReport = (instructorId: number): InstructorReportData | null => {
  // Find all classes taught by this instructor that have responses
  const instructorClasses = classesWithResponses.value.filter(c => {
    if (typeof c.teacher_id === 'object' && c.teacher_id) {
      return c.teacher_id.id === instructorId
    }
    return false
  })

  if (instructorClasses.length === 0) return null

  // Get instructor name and academic term from first class
  const firstClass = instructorClasses[0]
  const instructorName = typeof firstClass.teacher_id === 'object' && firstClass.teacher_id
    ? `${firstClass.teacher_id.first_name} ${firstClass.teacher_id.last_name}`
    : 'Unknown Instructor'
  const academicTerm = typeof firstClass.acadTerm_id === 'object' && firstClass.acadTerm_id
    ? `${firstClass.acadTerm_id.semester} ${firstClass.acadTerm_id.schoolYear}`
    : ''

  // Generate evaluation data for each class
  const classes: ClassEvaluationData[] = []
  let totalRespondents = 0
  let totalStudents = 0
  let overallSum = 0
  let overallCount = 0

  for (const classItem of instructorClasses) {
    const classData = generateClassEvaluationData(classItem.id)
    if (classData) {
      classes.push(classData)
      totalRespondents += classData.totalRespondents
      totalStudents += classData.totalStudents
      overallSum += classData.overallAverage * classData.totalRespondents
      overallCount += classData.totalRespondents
    }
  }

  const overallAverage = overallCount > 0 ? overallSum / overallCount : 0
  const responseRate = totalStudents > 0 ? Math.round((totalRespondents / totalStudents) * 100) : 0

  return {
    instructorId,
    instructorName,
    academicTerm,
    totalClasses: classes.length,
    totalRespondents,
    totalStudents,
    overallAverage,
    responseRate,
    classes,
  }
}

// Open export dialog
const openExportDialog = () => {
  selectedInstructorForExport.value = null
  currentInstructorReport.value = null
  isExportDialogOpen.value = true
}

// Generate report for selected instructor
const generateReport = () => {
  if (!selectedInstructorForExport.value) return

  isGeneratingReport.value = true
  try {
    const report = generateInstructorReport(selectedInstructorForExport.value)
    currentInstructorReport.value = report
  }
  finally {
    isGeneratingReport.value = false
  }
}

// Get verbal interpretation for average score
const getVerbalInterpretation = (avg: number): string => {
  if (avg >= 4.5) return 'Outstanding'
  if (avg >= 3.5) return 'Very Satisfactory'
  if (avg >= 2.5) return 'Satisfactory'
  if (avg >= 1.5) return 'Unsatisfactory'
  return 'Poor'
}

// ==================== OFFICE EXPORT FUNCTIONS ====================

// Generate office evaluation report
const generateOfficeReport = (): OfficeReportData | null => {
  if (form.value.evaluation_type !== 'Office' || responses.value.length === 0) return null

  const officeId = form.value.office_id
  const office = schoolOffices.value.find(o => o.id === officeId)
  const officeName = office?.name || 'Unknown Office'
  const academicTerm = academicTerms.value.find(t => t.id === form.value.academic_term_id)
  const academicTermStr = academicTerm ? `${academicTerm.semester} ${academicTerm.schoolYear}` : ''

  const totalRespondents = responses.value.length
  const totalExpected = totalAssignedStudentsForOffice.value
  const responseRate = totalExpected > 0 ? Math.round((totalRespondents / totalExpected) * 100) : 0

  // Calculate statistics per question group
  const questionStatsData: OfficeReportData['questionStats'] = []
  let totalSum = 0
  let totalCount = 0

  for (const group of form.value.question_group) {
    const groupStats: OfficeReportData['questionStats'][0] = {
      groupTitle: group.title || `Group ${group.number}`,
      questions: [],
    }

    for (const question of group.questions || []) {
      if (!question.id) continue

      // Get answers for this question
      const answers: number[] = []
      for (const response of responses.value) {
        if (!response.answers) continue
        for (const answer of response.answers) {
          const answerQuestionId = typeof answer.question_id === 'object'
            ? answer.question_id.id
            : answer.question_id
          if (answerQuestionId === question.id) {
            const numVal = parseFloat(answer.answer_value)
            if (!isNaN(numVal)) {
              answers.push(numVal)
            }
          }
        }
      }

      if (answers.length > 0) {
        const avg = answers.reduce((a, b) => a + b, 0) / answers.length
        const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
        for (const val of answers) {
          const key = Math.round(val).toString()
          if (distribution[key] !== undefined) {
            distribution[key]++
          }
        }

        groupStats.questions.push({
          questionText: question.question,
          average: avg,
          distribution,
          totalResponses: answers.length,
        })

        totalSum += avg * answers.length
        totalCount += answers.length
      }
    }

    if (groupStats.questions.length > 0) {
      questionStatsData.push(groupStats)
    }
  }

  const overallAverage = totalCount > 0 ? totalSum / totalCount : 0

  // Collect comments from Open-Ended question answers
  const comments = extractCommentsFromResponses(responses.value)

  // Build individual response data
  const responseDetails: OfficeReportData['responses'] = responses.value.map(response => {
    const student = typeof response.student_id === 'object' ? response.student_id : null
    const studentName = student ? `${student.last_name}, ${student.first_name}` : 'Unknown'
    const studentNumber = student?.student_number || 'N/A'

    // Find student's program/department
    const studentItem = availableStudents.value.find((s: StudentItem) => s.id === student?.id)
    const program = studentItem ? getStudentDepartmentName(studentItem) : 'N/A'

    const answersData: OfficeReportData['responses'][0]['answers'] = []
    for (const group of form.value.question_group) {
      for (const question of group.questions || []) {
        if (!question.id) continue
        const answer = response.answers?.find(a => {
          const qId = typeof a.question_id === 'object' ? a.question_id.id : a.question_id
          return qId === question.id
        })
        answersData.push({
          groupTitle: group.title || `Group ${group.number}`,
          questionText: question.question,
          answerValue: answer?.answer_value || '',
          responseStyle: group.response_style,
        })
      }
    }

    return {
      studentName,
      studentNumber,
      program,
      submittedAt: response.submitted_at,
      answers: answersData,
    }
  })

  return {
    officeId: officeId || 0,
    officeName,
    surveyTitle: form.value.title,
    academicTerm: academicTermStr,
    totalRespondents,
    totalExpected,
    responseRate,
    overallAverage,
    questionStats: questionStatsData,
    comments,
    responses: responseDetails,
  }
}

// Open office export dialog
const openOfficeExportDialog = () => {
  const report = generateOfficeReport()
  currentOfficeReport.value = report
  isOfficeExportDialogOpen.value = true
}

// Export office report as CSV
const exportOfficeReportAsCSV = () => {
  if (!currentOfficeReport.value) return

  const report = currentOfficeReport.value

  // Escape CSV values
  const escapeCSV = (value: string | number | undefined): string => {
    if (value === undefined || value === null) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines: string[] = []

  // Header Info
  lines.push('OFFICE EVALUATION REPORT')
  lines.push('')
  lines.push(`Office:,${escapeCSV(report.officeName)}`)
  lines.push(`Survey Title:,${escapeCSV(report.surveyTitle)}`)
  lines.push(`Academic Term:,${escapeCSV(report.academicTerm)}`)
  lines.push(`Total Respondents:,${report.totalRespondents}`)
  lines.push(`Total Expected:,${report.totalExpected}`)
  lines.push(`Response Rate:,${report.responseRate}%`)
  lines.push(`Overall Average:,${report.overallAverage.toFixed(2)}`)
  lines.push(`Interpretation:,${escapeCSV(getVerbalInterpretation(report.overallAverage))}`)
  lines.push('')

  // Question Statistics
  lines.push('QUESTION STATISTICS')
  lines.push('Group,Question,Average,Interpretation,1 (Poor),2 (Unsatisfactory),3 (Satisfactory),4 (Very Satisfactory),5 (Outstanding)')

  for (const group of report.questionStats) {
    for (const q of group.questions) {
      lines.push([
        escapeCSV(group.groupTitle),
        escapeCSV(q.questionText),
        q.average.toFixed(2),
        escapeCSV(getVerbalInterpretation(q.average)),
        q.distribution['1'],
        q.distribution['2'],
        q.distribution['3'],
        q.distribution['4'],
        q.distribution['5'],
      ].join(','))
    }
  }

  lines.push('')

  // Individual Responses
  lines.push('INDIVIDUAL RESPONSES')

  // Build header with all questions
  const allQuestions: { groupTitle: string; questionText: string }[] = []
  for (const group of report.questionStats) {
    for (const q of group.questions) {
      allQuestions.push({ groupTitle: group.groupTitle, questionText: q.questionText })
    }
  }

  const responseHeaders = ['Student Name', 'Student Number', 'Program', 'Submitted At', ...allQuestions.map(q => escapeCSV(q.questionText))]
  lines.push(responseHeaders.join(','))

  for (const response of report.responses) {
    const answerValues = allQuestions.map(q => {
      const answer = response.answers.find(a => a.questionText === q.questionText)
      return escapeCSV(answer?.answerValue || '')
    })

    lines.push([
      escapeCSV(response.studentName),
      escapeCSV(response.studentNumber),
      escapeCSV(response.program),
      escapeCSV(new Date(response.submittedAt).toLocaleString()),
      ...answerValues,
    ].join(','))
  }

  lines.push('')

  // Comments Section
  if (report.comments.length > 0) {
    lines.push('ALL COMMENTS')
    lines.push('Comment')
    for (const comment of report.comments) {
      lines.push(escapeCSV(comment))
    }
  }

  // Generate and download CSV
  const csvContent = lines.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const filename = `office-evaluation-${report.officeName.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.csv`
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Print office report
const printOfficeReport = () => {
  if (!currentOfficeReport.value) return

  const report = currentOfficeReport.value
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow pop-ups to print the report')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Office Evaluation Report - ${report.officeName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; padding: 20px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h1 { font-size: 18px; margin-bottom: 5px; }
        .header h2 { font-size: 14px; font-weight: normal; color: #666; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .info-item { padding: 8px; background: #f5f5f5; border-radius: 4px; }
        .info-item label { font-weight: bold; color: #666; font-size: 10px; display: block; }
        .info-item span { font-size: 13px; }
        .summary-box { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
        .summary-box .big-number { font-size: 36px; font-weight: bold; color: #1976d2; }
        .summary-box .label { font-size: 12px; color: #666; }
        .section-title { font-size: 14px; font-weight: bold; margin: 20px 0 10px; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
        th { background: #f5f5f5; font-weight: bold; }
        .avg-cell { text-align: center; font-weight: bold; }
        .center-cell { text-align: center; }
        .dist-cell { font-size: 10px; color: #666; }
        .comments-section { margin-top: 20px; }
        .comment-item { padding: 10px; background: #f9f9f9; border-left: 3px solid #1976d2; margin-bottom: 8px; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #666; }
        .interpretation { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
        .interpretation.outstanding { background: #c8e6c9; color: #2e7d32; }
        .interpretation.very-satisfactory { background: #dcedc8; color: #558b2f; }
        .interpretation.satisfactory { background: #fff9c4; color: #f9a825; }
        .interpretation.unsatisfactory { background: #ffecb3; color: #ff8f00; }
        .interpretation.poor { background: #ffcdd2; color: #c62828; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>OFFICE EVALUATION REPORT</h1>
        <h2>${report.surveyTitle}</h2>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <label>OFFICE</label>
          <span>${report.officeName}</span>
        </div>
        <div class="info-item">
          <label>ACADEMIC TERM</label>
          <span>${report.academicTerm || 'N/A'}</span>
        </div>
        <div class="info-item">
          <label>TOTAL RESPONDENTS</label>
          <span>${report.totalRespondents} / ${report.totalExpected} students (${report.responseRate}%)</span>
        </div>
        <div class="info-item">
          <label>RESPONSE RATE</label>
          <span>${report.responseRate}%</span>
        </div>
      </div>

      <div class="summary-box">
        <div class="big-number">${report.overallAverage.toFixed(2)}</div>
        <div class="label">OVERALL RATING</div>
        <div class="interpretation ${getVerbalInterpretation(report.overallAverage).toLowerCase().replace(' ', '-')}">${getVerbalInterpretation(report.overallAverage)}</div>
      </div>

      <div class="section-title">QUESTION STATISTICS</div>
      ${report.questionStats.map(group => `
        <h4 style="margin: 15px 0 8px; font-size: 12px; color: #1976d2;">${group.groupTitle}</h4>
        <table>
          <thead>
            <tr>
              <th style="width: 50%;">Question</th>
              <th style="width: 15%;" class="avg-cell">Average</th>
              <th style="width: 15%;" class="avg-cell">Interpretation</th>
              <th style="width: 20%;">Distribution (1-5)</th>
            </tr>
          </thead>
          <tbody>
            ${group.questions.map(q => `
              <tr>
                <td>${q.questionText}</td>
                <td class="avg-cell">${q.average.toFixed(2)}</td>
                <td class="avg-cell">
                  <span class="interpretation ${getVerbalInterpretation(q.average).toLowerCase().replace(' ', '-')}">${getVerbalInterpretation(q.average)}</span>
                </td>
                <td class="dist-cell">1:${q.distribution['1']} | 2:${q.distribution['2']} | 3:${q.distribution['3']} | 4:${q.distribution['4']} | 5:${q.distribution['5']}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `).join('')}

      ${report.comments.length > 0 ? `
        <div class="section-title">STUDENT COMMENTS (${report.comments.length})</div>
        <div class="comments-section">
          ${report.comments.map((comment, i) => `
            <div class="comment-item">
              ${i + 1}. ${comment}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="footer">
        <p>Report Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>
        <p>This is a computer-generated report from the Student Evaluation Survey System</p>
      </div>

      <script>
        window.onload = function() { window.print(); }
      <\/script>
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}

// Print/Export the report
const printReport = () => {
  if (!currentInstructorReport.value) return

  const report = currentInstructorReport.value
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow pop-ups to print the report')
    return
  }

  // Collect all comments from all classes
  const allComments: { classInfo: string; comment: string }[] = []
  for (const classData of report.classes) {
    for (const comment of classData.comments) {
      allComments.push({
        classInfo: `${classData.courseCode} - ${classData.section}`,
        comment,
      })
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Faculty Evaluation Report - ${report.instructorName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; padding: 20px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h1 { font-size: 18px; margin-bottom: 5px; }
        .header h2 { font-size: 14px; font-weight: normal; color: #666; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .info-item { padding: 8px; background: #f5f5f5; border-radius: 4px; }
        .info-item label { font-weight: bold; color: #666; font-size: 10px; display: block; }
        .info-item span { font-size: 13px; }
        .summary-box { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
        .summary-box .big-number { font-size: 36px; font-weight: bold; color: #1976d2; }
        .summary-box .label { font-size: 12px; color: #666; }
        .stats-row { display: flex; gap: 15px; margin-bottom: 20px; }
        .stat-box { flex: 1; padding: 10px; background: #f5f5f5; border-radius: 4px; text-align: center; }
        .stat-box .number { font-size: 20px; font-weight: bold; }
        .stat-box .label { font-size: 10px; color: #666; }
        .section-title { font-size: 14px; font-weight: bold; margin: 20px 0 10px; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
        th { background: #f5f5f5; font-weight: bold; }
        .avg-cell { text-align: center; font-weight: bold; }
        .center-cell { text-align: center; }
        .dist-cell { font-size: 10px; color: #666; }
        .comments-section { margin-top: 20px; }
        .comment-item { padding: 10px; background: #f9f9f9; border-left: 3px solid #1976d2; margin-bottom: 8px; }
        .comment-class { font-size: 10px; color: #666; margin-bottom: 4px; }
        .class-section { margin-top: 30px; padding-top: 20px; border-top: 2px dashed #ccc; }
        .class-header { background: #1976d2; color: white; padding: 10px 15px; border-radius: 4px; margin-bottom: 15px; }
        .class-header h3 { font-size: 14px; margin: 0; }
        .class-header p { font-size: 11px; margin: 5px 0 0; opacity: 0.9; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #666; }
        .interpretation { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
        .interpretation.outstanding { background: #c8e6c9; color: #2e7d32; }
        .interpretation.very-satisfactory { background: #dcedc8; color: #558b2f; }
        .interpretation.satisfactory { background: #fff9c4; color: #f9a825; }
        .interpretation.unsatisfactory { background: #ffecb3; color: #ff8f00; }
        .interpretation.poor { background: #ffcdd2; color: #c62828; }
        .page-break { page-break-before: always; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
          .class-section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>FACULTY EVALUATION REPORT</h1>
        <h2>${form.value.title}</h2>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <label>INSTRUCTOR</label>
          <span>${report.instructorName}</span>
        </div>
        <div class="info-item">
          <label>ACADEMIC TERM</label>
          <span>${report.academicTerm || 'N/A'}</span>
        </div>
        <div class="info-item">
          <label>TOTAL CLASSES</label>
          <span>${report.totalClasses}</span>
        </div>
        <div class="info-item">
          <label>TOTAL RESPONDENTS</label>
          <span>${report.totalRespondents} / ${report.totalStudents} students (${report.responseRate}%)</span>
        </div>
      </div>

      <div class="summary-box">
        <div class="big-number">${report.overallAverage.toFixed(2)}</div>
        <div class="label">OVERALL RATING (All Classes Combined)</div>
        <div class="interpretation ${getVerbalInterpretation(report.overallAverage).toLowerCase().replace(' ', '-')}">${getVerbalInterpretation(report.overallAverage)}</div>
      </div>

      <div class="section-title">CLASSES SUMMARY</div>
      <table>
        <thead>
          <tr>
            <th>Course Code</th>
            <th>Course Name</th>
            <th>Section</th>
            <th class="center-cell">Respondents</th>
            <th class="center-cell">Total Students</th>
            <th class="center-cell">Response Rate</th>
            <th class="avg-cell">Average</th>
            <th class="center-cell">Interpretation</th>
          </tr>
        </thead>
        <tbody>
          ${report.classes.map(c => `
            <tr>
              <td>${c.courseCode}</td>
              <td>${c.courseName}</td>
              <td>${c.section}</td>
              <td class="center-cell">${c.totalRespondents}</td>
              <td class="center-cell">${c.totalStudents}</td>
              <td class="center-cell">${c.responseRate}%</td>
              <td class="avg-cell">${c.overallAverage.toFixed(2)}</td>
              <td class="center-cell">
                <span class="interpretation ${getVerbalInterpretation(c.overallAverage).toLowerCase().replace(' ', '-')}">${getVerbalInterpretation(c.overallAverage)}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${report.classes.map((classData, classIndex) => `
        <div class="class-section ${classIndex > 0 ? 'page-break' : ''}">
          <div class="class-header">
            <h3>${classData.courseCode} - ${classData.courseName}</h3>
            <p>Section: ${classData.section} | Respondents: ${classData.totalRespondents}/${classData.totalStudents} (${classData.responseRate}%) | Average: ${classData.overallAverage.toFixed(2)}</p>
          </div>

          ${classData.questionStats.map(group => `
            <h4 style="margin: 15px 0 8px; font-size: 12px; color: #1976d2;">${group.groupTitle}</h4>
            <table>
              <thead>
                <tr>
                  <th style="width: 50%;">Question</th>
                  <th style="width: 15%;" class="avg-cell">Average</th>
                  <th style="width: 15%;" class="avg-cell">Interpretation</th>
                  <th style="width: 20%;">Distribution (1-5)</th>
                </tr>
              </thead>
              <tbody>
                ${group.questions.map(q => `
                  <tr>
                    <td>${q.questionText}</td>
                    <td class="avg-cell">${q.average.toFixed(2)}</td>
                    <td class="avg-cell">
                      <span class="interpretation ${getVerbalInterpretation(q.average).toLowerCase().replace(' ', '-')}">${getVerbalInterpretation(q.average)}</span>
                    </td>
                    <td class="dist-cell">1:${q.distribution['1']} | 2:${q.distribution['2']} | 3:${q.distribution['3']} | 4:${q.distribution['4']} | 5:${q.distribution['5']}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `).join('')}
        </div>
      `).join('')}

      ${allComments.length > 0 ? `
        <div class="section-title page-break">STUDENT COMMENTS (${allComments.length})</div>
        <div class="comments-section">
          ${allComments.map((item, i) => `
            <div class="comment-item">
              <div class="comment-class">${item.classInfo}</div>
              ${i + 1}. ${item.comment}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="footer">
        <p>Report Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>
        <p>This is a computer-generated report from the Student Evaluation Survey System</p>
      </div>

      <script>
        window.onload = function() { window.print(); }
      <\/script>
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}

// Question Group Management
const addQuestionGroup = () => {
  form.value.question_group.push({
    number: form.value.question_group.length + 1,
    title: '',
    response_style: 'Rating-Scale Questions',
    questions: [{ question: '' }],
  })
}

const removeQuestionGroup = (index: number) => {
  form.value.question_group.splice(index, 1)
  form.value.question_group.forEach((group, i) => {
    group.number = i + 1
  })
}

// Question Management
const addQuestion = (groupIndex: number) => {
  form.value.question_group[groupIndex].questions!.push({ question: '' })
}

const removeQuestion = (groupIndex: number, questionIndex: number) => {
  form.value.question_group[groupIndex].questions!.splice(questionIndex, 1)
}

// Save survey
const saveSurvey = async () => {
  if (!form.value.title.trim()) {
    alert('Please enter a survey title')
    return
  }

  // Validate office selection for office-based surveys
  if (form.value.evaluation_type === 'Office' && !form.value.office_id) {
    alert('Please select a school office')
    return
  }

  isSaving.value = true
  try {
    // Format question groups for Directus nested update
    const formattedQuestionGroups = form.value.question_group.map(group => {
      const groupData: any = {
        number: group.number,
        title: group.title || null,
        response_style: group.response_style,
        survey_id: surveyId.value, // Explicitly link to parent survey
        questions: (group.questions || []).map(q => {
          const questionData: any = {
            question: q.question,
          }
          // Include id only for existing questions
          if (q.id) questionData.id = q.id
          // For new questions, link will be set by Directus via parent
          return questionData
        }),
      }
      // Include id only for existing groups
      if (group.id) groupData.id = group.id
      return groupData
    })

    // Build the request body
    const requestBody: any = {
      title: form.value.title,
      instruction: form.value.instruction,
      survey_start: form.value.survey_start || null,
      survey_end: form.value.survey_end || null,
      is_active: form.value.is_active,
      academic_term_id: form.value.academic_term_id,
      evaluation_type: form.value.evaluation_type,
      office_id: form.value.evaluation_type === 'Office' ? form.value.office_id : null,
      assignment_mode: form.value.evaluation_type === 'Office' ? form.value.assignment_mode : null,
      target_year_levels: form.value.target_year_levels.length > 0 ? form.value.target_year_levels : null,
      question_group: formattedQuestionGroups.length > 0 ? formattedQuestionGroups : [],
    }

    // Handle class assignments for class-based surveys (M2M with junction table)
    if (form.value.evaluation_type === 'Class') {
      requestBody.student_percentage = form.value.student_percentage

      // Get current junction table entries to determine what to create/delete
      const currentRes = await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
        params: {
          fields: ['classes.id', 'classes.classes_id.id'],
        },
      })
      const currentJunctions = currentRes.data?.classes || []

      // Map current class IDs and their junction IDs
      const currentClassMap = new Map<number, number>()
      currentJunctions.forEach((j: any) => {
        const classId = typeof j.classes_id === 'object' ? j.classes_id?.id : j.classes_id
        if (classId && j.id) {
          currentClassMap.set(classId, j.id)
        }
      })
      const currentClassIds = Array.from(currentClassMap.keys())

      // Determine what to create and delete
      const toCreate = assignedClassIds.value.filter(id => !currentClassIds.includes(id))
      const toDelete = currentClassIds
        .filter(id => !assignedClassIds.value.includes(id))
        .map(id => currentClassMap.get(id)!)

      // Build the M2M update object
      requestBody.classes = {
        create: toCreate.map(classId => ({
          StudentEvaluationSurvey_id: surveyId.value.toString(),
          classes_id: { id: classId },
        })),
        update: [],
        delete: toDelete,
      }
    }

    console.log('Saving with data:', JSON.stringify(requestBody, null, 2))

    await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
      method: 'PATCH',
      body: requestBody,
    })

    // Handle student assignments for office-based surveys via M2M
    if (form.value.evaluation_type === 'Office' && (form.value.assignment_mode === 'specific' || form.value.assignment_mode === 'department')) {
      // Determine which student IDs to assign
      let studentIdsToAssign: number[] = []

      if (form.value.assignment_mode === 'specific') {
        studentIdsToAssign = assignedStudentIds.value
      }
      else if (form.value.assignment_mode === 'department') {
        // Get all students from selected departments
        studentIdsToAssign = availableStudents.value
          .filter(s => assignedDepartmentIds.value.includes(s.deparment_id || 0))
          .map(s => s.id)
      }

      // Get existing student assignments with junction IDs
      const existingRes = await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
        params: {
          fields: ['students.id', 'students.students_id'],
        },
      })
      const existingJunctions = existingRes.data?.students || []

      // Map current student IDs and their junction IDs
      const currentStudentMap = new Map<number, number>()
      existingJunctions.forEach((j: any) => {
        const studentId = typeof j.students_id === 'object' ? j.students_id?.id : j.students_id
        if (studentId && j.id) {
          currentStudentMap.set(studentId, j.id)
        }
      })
      const currentStudentIds = Array.from(currentStudentMap.keys())

      // Determine what to create and delete
      const toCreate = studentIdsToAssign.filter(id => !currentStudentIds.includes(id))
      const toDelete = currentStudentIds
        .filter(id => !studentIdsToAssign.includes(id))
        .map(id => currentStudentMap.get(id)!)

      // Update via M2M format
      await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
        method: 'PATCH',
        body: {
          students: {
            create: toCreate.map(studentId => ({
              StudentEvaluationSurvey_id: surveyId.value.toString(),
              students_id: { id: studentId },
            })),
            update: [],
            delete: toDelete,
          },
        },
      })
    }

    router.push('/surveys/student-evaluation')
  }
  catch (error: any) {
    console.error('Failed to save survey:', error)
    const errorMsg = error?.data?.errors?.[0]?.message || error?.message || 'Unknown error'
    console.error('Directus error details:', error?.data)
    alert(`Failed to save survey: ${errorMsg}`)
  }
  finally {
    isSaving.value = false
  }
}

// Go back to surveys list
const goBack = () => {
  router.push('/surveys/student-evaluation')
}

// Watch tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'responses') {
    if (responses.value.length === 0) {
      fetchResponses()
    }
    // Load data needed for pending by program calculation
    if (availableStudents.value.length === 0) {
      fetchStudents()
    }
    if (availableDepartments.value.length === 0) {
      fetchDepartments()
    }
    if (form.value.evaluation_type === 'Class' && availableClasses.value.length === 0) {
      fetchClasses()
      fetchAssignedClasses()
    }
  }
  if (newTab === 'assignment') {
    // Load appropriate data based on evaluation type
    if (form.value.evaluation_type === 'Class' && availableClasses.value.length === 0) {
      fetchClasses()
      fetchAssignedClasses()
    }
    else if (form.value.evaluation_type === 'Office') {
      if (availableStudents.value.length === 0) {
        fetchStudents()
      }
      fetchAssignedStudents()
      if (availableDepartments.value.length === 0) {
        fetchDepartments()
      }
    }
  }
})

onMounted(() => {
  fetchResponseStyleOptions()
  fetchAcademicTerms()
  fetchSchoolOffices()
  fetchSurveyDetails()
  fetchAssignedClasses()
  fetchAssignedStudents()
})
</script>

<template>
  <div>
    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading survey...</span>
      </VCardText>
    </VCard>

    <!-- Main Content -->
    <VCard v-else>
      <VCardTitle class="pa-6">
        <div class="d-flex align-center">
          <div>
            <span class="text-h5">{{ form.title }}</span>
          </div>
        </div>
      </VCardTitle>

      <VDivider />

      <!-- Tabs -->
      <VTabs v-model="activeTab" class="px-4">
        <VTab value="edit">
          <VIcon icon="ri-edit-line" class="me-2" />
          Edit Survey
        </VTab>
        <VTab value="assignment">
          <VIcon icon="ri-group-line" class="me-2" />
          Assignment
          <VChip
            v-if="form.evaluation_type === 'Class' ? assignedClassIds.length > 0 : (form.assignment_mode === 'specific' ? assignedStudentIds.length > 0 : availableStudents.length > 0)"
            size="x-small"
            color="success"
            class="ms-2"
          >
            {{ form.evaluation_type === 'Class' ? assignedClassIds.length : (form.assignment_mode === 'specific' ? assignedStudentIds.length : 'All') }}
          </VChip>
        </VTab>
        <VTab value="responses">
          <VIcon icon="ri-bar-chart-line" class="me-2" />
          Responses
          <VChip v-if="responses.length > 0" size="x-small" color="primary" class="ms-2">
            {{ responses.length }}
          </VChip>
        </VTab>
      </VTabs>

      <VDivider />

      <!-- Edit Tab -->
      <template v-if="activeTab === 'edit'">
        <VCardText class="pa-6">
          <VForm @submit.prevent="saveSurvey">
            <VRow>
              <!-- Basic Information -->
              <VCol cols="12">
                <h6 class="text-h6 mb-4">Basic Information</h6>
              </VCol>

              <VCol cols="12" md="8">
                <VTextField
                  v-model="form.title"
                  label="Survey Title"
                  placeholder="Enter survey title"
                  variant="outlined"
                  :rules="[v => !!v || 'Title is required']"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VSelect
                  v-model="form.is_active"
                  :items="statusOptions"
                  item-title="title"
                  item-value="value"
                  label="Status"
                  variant="outlined"
                />
              </VCol>

              <!-- Evaluation Type -->
              <VCol cols="12" md="6">
                <VSelect
                  v-model="form.evaluation_type"
                  :items="evaluationTypeOptions"
                  item-title="title"
                  item-value="value"
                  label="Evaluation Type"
                  variant="outlined"
                />
              </VCol>

              <!-- Office Selection (only for office-based surveys) -->
              <VCol v-if="form.evaluation_type === 'Office'" cols="12" md="6">
                <VSelect
                  v-model="form.office_id"
                  :items="schoolOffices"
                  item-title="name"
                  item-value="id"
                  label="School Office"
                  placeholder="Select office to evaluate"
                  variant="outlined"
                  :rules="[v => !!v || 'Please select an office']"
                />
              </VCol>

              <!-- Target Year Levels -->
              <VCol cols="12" md="6">
                <VSelect
                  v-model="form.target_year_levels"
                  :items="YEAR_LEVEL_OPTIONS"
                  item-title="title"
                  item-value="value"
                  label="Target Year Levels"
                  placeholder="All year levels"
                  variant="outlined"
                  multiple
                  chips
                  closable-chips
                  clearable
                  hint="Leave empty to target all year levels"
                  persistent-hint
                />
              </VCol>

              <VCol cols="12">
                <VTextarea
                  v-model="form.instruction"
                  label="Instructions"
                  placeholder="Enter instructions for respondents"
                  variant="outlined"
                  rows="3"
                />
              </VCol>

              <!-- Schedule -->
              <VCol cols="12" class="mt-4">
                <h6 class="text-h6 mb-4">Schedule</h6>
              </VCol>

              <VCol cols="12">
                <VSelect
                  v-model="form.academic_term_id"
                  :items="academicTerms"
                  :item-title="(item) => `${item.schoolYear} - ${item.semester}`"
                  item-value="id"
                  label="Academic Term"
                  variant="outlined"
                  clearable
                />
              </VCol>

              <!-- Start Date & Time -->
              <VCol cols="12" md="4">
                <VMenu
                  v-model="startDateMenu"
                  :close-on-content-click="false"
                  location="bottom start"
                >
                  <template #activator="{ props }">
                    <VTextField
                      v-bind="props"
                      :model-value="formatDateDisplay(form.survey_start)"
                      label="Start Date & Time"
                      variant="outlined"
                      prepend-inner-icon="ri-calendar-line"
                      readonly
                      clearable
                      @click:clear="form.survey_start = ''"
                    />
                  </template>
                  <VCard min-width="300">
                    <VDatePicker
                      v-model="startDateValue"
                      show-adjacent-months
                      hide-header
                    />
                    <VDivider />
                    <div class="pa-3">
                      <VTextField
                        v-model="startTimeValue"
                        label="Time"
                        type="time"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </div>
                    <VCardActions>
                      <VSpacer />
                      <VBtn variant="text" @click="startDateMenu = false">Done</VBtn>
                    </VCardActions>
                  </VCard>
                </VMenu>
              </VCol>

              <!-- End Date & Time -->
              <VCol cols="12" md="4">
                <VMenu
                  v-model="endDateMenu"
                  :close-on-content-click="false"
                  location="bottom start"
                >
                  <template #activator="{ props }">
                    <VTextField
                      v-bind="props"
                      :model-value="formatDateDisplay(form.survey_end)"
                      label="End Date & Time"
                      variant="outlined"
                      prepend-inner-icon="ri-calendar-line"
                      readonly
                      clearable
                      @click:clear="form.survey_end = ''"
                    />
                  </template>
                  <VCard min-width="300">
                    <VDatePicker
                      v-model="endDateValue"
                      show-adjacent-months
                      hide-header
                    />
                    <VDivider />
                    <div class="pa-3">
                      <VTextField
                        v-model="endTimeValue"
                        label="Time"
                        type="time"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </div>
                    <VCardActions>
                      <VSpacer />
                      <VBtn variant="text" @click="endDateMenu = false">Done</VBtn>
                    </VCardActions>
                  </VCard>
                </VMenu>
              </VCol>

              <!-- Question Groups -->
              <VCol cols="12" class="mt-4">
                <div class="d-flex align-center justify-space-between mb-4">
                  <h6 class="text-h6">Question Groups</h6>
                  <VBtn
                    color="primary"
                    variant="outlined"
                    size="small"
                    prepend-icon="ri-add-line"
                    @click="addQuestionGroup"
                  >
                    Add Group
                  </VBtn>
                </div>
              </VCol>

              <VCol v-if="form.question_group.length === 0" cols="12">
                <VAlert type="info" variant="tonal">
                  No question groups added yet. Click "Add Group" to create your first question group.
                </VAlert>
              </VCol>

              <VCol v-for="(group, groupIndex) in form.question_group" :key="groupIndex" cols="12">
                <VCard variant="outlined" class="mb-4">
                  <VCardTitle class="pa-4 bg-grey-lighten-4">
                    <div class="d-flex align-center justify-space-between">
                      <span class="text-subtitle-1 font-weight-medium">
                        Group {{ group.number }}
                      </span>
                      <VBtn
                        icon
                        variant="text"
                        color="error"
                        size="small"
                        @click="removeQuestionGroup(groupIndex)"
                      >
                        <VIcon icon="ri-delete-bin-line" />
                      </VBtn>
                    </div>
                  </VCardTitle>

                  <VDivider />

                  <VCardText class="pa-4">
                    <VRow>
                      <VCol cols="12" md="6">
                        <VTextField
                          v-model="group.title"
                          label="Group Title"
                          placeholder="e.g., Teaching Quality"
                          variant="outlined"
                          density="compact"
                        />
                      </VCol>

                      <VCol cols="12" md="6">
                        <VSelect
                          v-model="group.response_style"
                          :items="responseStyleOptions"
                          item-title="title"
                          item-value="value"
                          label="Response Style"
                          variant="outlined"
                          density="compact"
                        />
                      </VCol>

                      <VCol cols="12">
                        <div class="d-flex align-center justify-space-between mb-3">
                          <span class="text-subtitle-2">Questions</span>
                          <VBtn
                            color="secondary"
                            variant="tonal"
                            size="x-small"
                            prepend-icon="ri-add-line"
                            @click="addQuestion(groupIndex)"
                          >
                            Add Question
                          </VBtn>
                        </div>

                        <div
                          v-for="(question, questionIndex) in group.questions"
                          :key="questionIndex"
                          class="d-flex align-center gap-2 mb-2"
                        >
                          <span class="text-body-2 text-medium-emphasis" style="min-width: 24px;">
                            {{ questionIndex + 1 }}.
                          </span>
                          <VTextField
                            v-model="question.question"
                            :placeholder="`Enter question ${questionIndex + 1}`"
                            variant="outlined"
                            density="compact"
                            hide-details
                            class="flex-grow-1"
                          />
                          <VBtn
                            icon
                            variant="text"
                            color="error"
                            size="x-small"
                            :disabled="group.questions!.length === 1"
                            @click="removeQuestion(groupIndex, questionIndex)"
                          >
                            <VIcon icon="ri-close-line" size="18" />
                          </VBtn>
                        </div>
                      </VCol>
                    </VRow>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-6">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            @click="saveSurvey"
          >
            Save Changes
          </VBtn>
        </VCardActions>
      </template>

      <!-- Assignment Tab -->
      <template v-else-if="activeTab === 'assignment'">
        <VCardText class="pa-6">
          <!-- ==================== CLASS-BASED ASSIGNMENT ==================== -->
          <template v-if="form.evaluation_type === 'Class'">
            <!-- Loading -->
            <div v-if="isLoadingClasses" class="d-flex justify-center align-center pa-12">
              <VProgressCircular indeterminate color="primary" />
              <span class="ms-4">Loading classes...</span>
            </div>

            <template v-else>
              <!-- Compact Summary Bar -->
              <VCard variant="flat" class="bg-surface mb-4">
                <VCardText class="d-flex align-center flex-wrap gap-4 pa-4">
                  <div class="d-flex align-center gap-2">
                    <VIcon icon="ri-checkbox-circle-fill" color="success" />
                    <span class="text-body-1">
                      <strong>{{ assignedClassIds.length }}</strong> of {{ availableClasses.length }} classes selected
                    </span>
                  </div>
                  <VSpacer />
                  <VBtn
                    v-if="form.student_percentage < 100"
                    variant="text"
                    color="primary"
                    size="small"
                    @click="form.student_percentage = 100"
                  >
                    Use 100%
                  </VBtn>
                </VCardText>
              </VCard>

              <!-- Student Percentage Slider (compact) -->
              <div class="d-flex align-center gap-4 mb-4 px-2">
                <span class="text-body-2 text-medium-emphasis" style="min-width: 120px;">Student Selection:</span>
                <VSlider
                  v-model="form.student_percentage"
                  :min="10"
                  :max="100"
                  :step="5"
                  thumb-label
                  color="primary"
                  track-color="grey-lighten-2"
                  hide-details
                  class="flex-grow-1"
                />
                <VChip :color="form.student_percentage === 100 ? 'success' : 'warning'" variant="tonal" size="small">
                  {{ form.student_percentage }}%
                </VChip>
              </div>

              <!-- Search and Actions -->
              <div class="d-flex align-center gap-4 mb-4">
                <VTextField
                  v-model="classSearch"
                  prepend-inner-icon="ri-search-line"
                  placeholder="Search classes..."
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="max-width: 300px;"
                />
                <VSelect
                  v-model="classYearLevelFilter"
                  :items="[{ value: null, title: 'All Years' }, ...YEAR_LEVEL_OPTIONS]"
                  item-title="title"
                  item-value="value"
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="max-width: 150px;"
                  placeholder="Filter by year"
                />
                <VSpacer />
                <VBtnGroup variant="outlined" density="compact">
                  <VBtn color="success" @click="selectAllClasses">
                    <VIcon icon="ri-checkbox-multiple-line" class="me-1" />
                    All
                  </VBtn>
                  <VBtn color="secondary" @click="deselectAllClasses">
                    <VIcon icon="ri-checkbox-blank-line" class="me-1" />
                    None
                  </VBtn>
                </VBtnGroup>
              </div>

              <!-- No Classes -->
              <div v-if="availableClasses.length === 0" class="text-center pa-12">
                <VIcon icon="ri-school-line" size="64" color="medium-emphasis" class="mb-4" />
                <p class="text-h6 text-medium-emphasis mb-2">No Classes Available</p>
                <p class="text-body-2 text-medium-emphasis">
                  Create classes first before assigning them to surveys.
                </p>
              </div>

              <!-- Classes List -->
              <VCard v-else variant="outlined">
                <VList lines="two" class="pa-0">
                  <template v-for="(classItem, index) in filteredClasses" :key="classItem.id">
                    <VListItem
                      :class="isClassAssigned(classItem.id) ? 'bg-success-lighten-5 border-s-4 border-success' : ''"
                      class="transition-all"
                      @click="toggleClassAssignment(classItem.id)"
                    >
                      <template #prepend>
                        <VCheckboxBtn
                          :model-value="isClassAssigned(classItem.id)"
                          color="success"
                          @click.stop="toggleClassAssignment(classItem.id)"
                        />
                      </template>

                      <VListItemTitle class="font-weight-medium">
                        {{ getClassDisplayName(classItem) }}
                        <VIcon
                          v-if="isClassAssigned(classItem.id)"
                          icon="ri-check-line"
                          color="success"
                          size="16"
                          class="ms-1"
                        />
                      </VListItemTitle>

                      <VListItemSubtitle class="text-medium-emphasis">
                        {{ getClassSubtitle(classItem) || 'No course/teacher assigned' }}
                      </VListItemSubtitle>

                      <template #append>
                        <VChip
                          size="small"
                          variant="tonal"
                          :color="isClassAssigned(classItem.id) ? 'success' : 'default'"
                        >
                          <VIcon icon="ri-user-line" size="14" class="me-1" />
                          {{ getStudentCount(classItem) }}
                        </VChip>
                      </template>
                    </VListItem>

                    <VDivider v-if="index < filteredClasses.length - 1" />
                  </template>
                </VList>
              </VCard>

              <!-- No search results -->
              <div v-if="availableClasses.length > 0 && filteredClasses.length === 0" class="text-center pa-8">
                <VIcon icon="ri-search-line" size="48" color="medium-emphasis" class="mb-4" />
                <p class="text-body-1 text-medium-emphasis">No classes match your search</p>
              </div>
            </template>
          </template>

          <!-- ==================== OFFICE-BASED ASSIGNMENT ==================== -->
          <template v-else>
            <!-- Loading -->
            <div v-if="isLoadingStudents" class="d-flex justify-center align-center pa-12">
              <VProgressCircular indeterminate color="primary" />
              <span class="ms-4">Loading students...</span>
            </div>

            <template v-else>
              <!-- Compact Summary Bar with Mode Selection -->
              <VCard variant="flat" class="bg-surface mb-4">
                <VCardText class="d-flex align-center flex-wrap gap-4 pa-4">
                  <div class="d-flex align-center gap-2">
                    <span class="text-body-1">
                      Evaluating: <strong>{{ schoolOffices.find(o => o.id === form.office_id)?.name || 'Office' }}</strong>
                    </span>
                  </div>
                  <VDivider vertical class="mx-2" />
                  <div class="d-flex align-center gap-2">
                    <VIcon icon="ri-checkbox-circle-fill" color="success" />
                    <span class="text-body-1">
                      <strong>{{ totalAssignedStudentsForOffice }}</strong> of {{ availableStudents.length }} students assigned
                    </span>
                  </div>
                  <VSpacer />
                  <VSelect
                    v-model="form.assignment_mode"
                    :items="assignmentModeOptions"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 180px;"
                  />
                </VCardText>
              </VCard>

              <!-- All Students Mode Info -->
              <VAlert v-if="form.assignment_mode === 'all'" type="success" variant="tonal" class="mb-4">
                <VIcon icon="ri-checkbox-circle-line" class="me-2" />
                All {{ availableStudents.length }} students will be assigned to this survey automatically.
              </VAlert>

              <!-- Department Selection -->
              <template v-if="form.assignment_mode === 'department'">
                <div class="d-flex align-center gap-4 mb-4">
                  <span class="text-body-2 text-medium-emphasis">Select departments to include:</span>
                  <VSpacer />
                  <VBtnGroup variant="outlined" density="compact">
                    <VBtn color="success" @click="selectAllDepartments">
                      <VIcon icon="ri-checkbox-multiple-line" class="me-1" />
                      All
                    </VBtn>
                    <VBtn color="secondary" @click="deselectAllDepartments">
                      <VIcon icon="ri-checkbox-blank-line" class="me-1" />
                      None
                    </VBtn>
                  </VBtnGroup>
                </div>

                <!-- No Departments -->
                <div v-if="availableDepartments.length === 0" class="text-center pa-12">
                  <VIcon icon="ri-building-line" size="64" color="medium-emphasis" class="mb-4" />
                  <p class="text-h6 text-medium-emphasis mb-2">No Departments Available</p>
                  <p class="text-body-2 text-medium-emphasis">
                    Create departments first before assigning them to surveys.
                  </p>
                </div>

                <!-- Departments List -->
                <VCard v-else variant="outlined">
                  <VList lines="two" class="pa-0">
                    <template v-for="(dept, index) in availableDepartments" :key="dept.id">
                      <VListItem
                        :class="isDepartmentAssigned(dept.id) ? 'bg-success-lighten-5 border-s-4 border-success' : ''"
                        class="transition-all"
                        @click="toggleDepartmentAssignment(dept.id)"
                      >
                        <template #prepend>
                          <VCheckboxBtn
                            :model-value="isDepartmentAssigned(dept.id)"
                            color="success"
                            @click.stop="toggleDepartmentAssignment(dept.id)"
                          />
                        </template>

                        <VListItemTitle class="font-weight-medium">
                          {{ dept.name }}
                          <VIcon
                            v-if="isDepartmentAssigned(dept.id)"
                            icon="ri-check-line"
                            color="success"
                            size="16"
                            class="ms-1"
                          />
                        </VListItemTitle>

                        <VListItemSubtitle v-if="dept.programCode" class="text-medium-emphasis">
                          {{ dept.programCode }}
                        </VListItemSubtitle>

                        <template #append>
                          <VChip
                            size="small"
                            variant="tonal"
                            :color="isDepartmentAssigned(dept.id) ? 'success' : 'default'"
                          >
                            <VIcon icon="ri-user-line" size="14" class="me-1" />
                            {{ getStudentCountByDepartment(dept.id) }}
                          </VChip>
                        </template>
                      </VListItem>

                      <VDivider v-if="index < availableDepartments.length - 1" />
                    </template>
                  </VList>
                </VCard>
              </template>

              <!-- Specific Students Selection -->
              <template v-if="form.assignment_mode === 'specific'">
                <!-- Search and Actions -->
                <div class="d-flex align-center gap-4 mb-4">
                  <VTextField
                    v-model="studentSearch"
                    prepend-inner-icon="ri-search-line"
                    placeholder="Search by student number..."
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 300px;"
                  />
                  <VSelect
                    v-model="studentYearLevelFilter"
                    :items="[{ value: null, title: 'All Years' }, ...YEAR_LEVEL_OPTIONS]"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 150px;"
                    placeholder="Filter by year"
                  />
                  <VSpacer />
                  <VBtnGroup variant="outlined" density="compact">
                    <VBtn color="success" @click="selectAllStudents">
                      <VIcon icon="ri-checkbox-multiple-line" class="me-1" />
                      All
                    </VBtn>
                    <VBtn color="secondary" @click="deselectAllStudents">
                      <VIcon icon="ri-checkbox-blank-line" class="me-1" />
                      None
                    </VBtn>
                  </VBtnGroup>
                </div>

                <!-- No Students -->
                <div v-if="availableStudents.length === 0" class="text-center pa-12">
                  <VIcon icon="ri-user-line" size="64" color="medium-emphasis" class="mb-4" />
                  <p class="text-h6 text-medium-emphasis mb-2">No Students Available</p>
                  <p class="text-body-2 text-medium-emphasis">
                    Add students first before assigning them to surveys.
                  </p>
                </div>

                <!-- Students List (showing student number and department) -->
                <VCard v-else variant="outlined" style="max-height: 400px; overflow-y: auto;">
                  <VList lines="two" class="pa-0">
                    <template v-for="(student, index) in filteredStudents" :key="student.id">
                      <VListItem
                        :class="isStudentAssigned(student.id) ? 'bg-success-lighten-5 border-s-4 border-success' : ''"
                        class="transition-all"
                        @click="toggleStudentAssignment(student.id)"
                      >
                        <template #prepend>
                          <VCheckboxBtn
                            :model-value="isStudentAssigned(student.id)"
                            color="success"
                            @click.stop="toggleStudentAssignment(student.id)"
                          />
                        </template>

                        <VListItemTitle class="font-weight-medium">
                          {{ getStudentDisplayNumber(student) }}
                          <VIcon
                            v-if="isStudentAssigned(student.id)"
                            icon="ri-check-line"
                            color="success"
                            size="16"
                            class="ms-1"
                          />
                        </VListItemTitle>

                        <VListItemSubtitle class="text-medium-emphasis">
                          {{ getStudentDepartmentName(student) }}
                        </VListItemSubtitle>
                      </VListItem>

                      <VDivider v-if="index < filteredStudents.length - 1" />
                    </template>
                  </VList>
                </VCard>

                <!-- No search results -->
                <div v-if="availableStudents.length > 0 && filteredStudents.length === 0" class="text-center pa-8">
                  <VIcon icon="ri-search-line" size="48" color="medium-emphasis" class="mb-4" />
                  <p class="text-body-1 text-medium-emphasis">No students match your search</p>
                </div>
              </template>
            </template>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-6">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            @click="saveSurvey"
          >
            Save Changes
          </VBtn>
        </VCardActions>
      </template>

      <!-- Responses Tab -->
      <template v-else-if="activeTab === 'responses'">
        <VCardText class="pa-6">
          <!-- Loading -->
          <div v-if="isLoadingResponses" class="d-flex justify-center align-center pa-12">
            <VProgressCircular indeterminate color="primary" />
            <span class="ms-4">Loading responses...</span>
          </div>

          <!-- No Responses -->
          <div v-else-if="responses.length === 0" class="text-center pa-12">
            <VIcon icon="ri-inbox-line" size="48" color="medium-emphasis" class="mb-4" />
            <p class="text-subtitle-1 text-medium-emphasis mb-2">No Responses Yet</p>
            <p class="text-body-2 text-medium-emphasis">
              Responses will appear here once students submit them.
            </p>
          </div>

          <!-- Responses Summary -->
          <template v-else>
            <!-- Summary Statistics -->
            <VCard variant="outlined" class="mb-6">
              <VCardText class="pa-4">
                <div class="d-flex flex-wrap align-center justify-space-between gap-4">
                  <div class="d-flex align-center gap-8">
                    <div class="text-center">
                      <div class="text-h5 font-weight-bold">{{ responses.length }}</div>
                      <div class="text-caption text-medium-emphasis">Responses</div>
                    </div>
                    <VDivider vertical class="align-self-stretch" />
                    <div class="text-center">
                      <div class="text-h5 font-weight-bold">{{ pendingResponsesCount }}</div>
                      <div class="text-caption text-medium-emphasis">Pending</div>
                    </div>
                    <VDivider vertical class="align-self-stretch" />
                    <div class="text-center">
                      <div class="text-h5 font-weight-bold">
                        {{ totalExpectedStudents > 0 ? Math.round((responses.length / totalExpectedStudents) * 100) : 0 }}%
                      </div>
                      <div class="text-caption text-medium-emphasis">Completion Rate</div>
                    </div>
                  </div>
                  <div class="d-flex gap-2">
                    <VBtn
                      v-if="form.evaluation_type === 'Class' && classesWithResponses.length > 0"
                      color="primary"
                      variant="outlined"
                      size="small"
                      @click="openExportDialog"
                    >
                      Export Report
                    </VBtn>
                    <VBtn
                      v-if="form.evaluation_type === 'Office' && responses.length > 0"
                      color="primary"
                      variant="outlined"
                      size="small"
                      @click="openOfficeExportDialog"
                    >
                      Export Report
                    </VBtn>
                  </div>
                </div>
              </VCardText>
            </VCard>

            <!-- Professors Table (for Class evaluations) -->
            <VCard v-if="form.evaluation_type === 'Class' && instructorsWithResponses.length > 0" variant="outlined" class="mb-6">
              <VCardTitle class="pa-4 text-subtitle-1">
                Professors
              </VCardTitle>
              <VDivider />
              <VDataTable
                :headers="professorTableHeaders"
                :items="instructorsWithResponses"
                hover
                class="clickable-rows"
                density="comfortable"
                @click:row="(_event: Event, { item }: { item: any }) => openProfessorDetail(item)"
              >
                <template #item.name="{ item }">
                  <span class="font-weight-medium">{{ item.name }}</span>
                </template>

                <template #item.classCount="{ item }">
                  {{ item.classCount }}
                </template>

                <template #item.responseCount="{ item }">
                  {{ item.responseCount }}
                </template>

                <template #item.averageRating="{ item }">
                  <span
                    v-if="item.averageRating > 0"
                    class="font-weight-medium"
                    :class="item.averageRating >= 4 ? 'text-success' : item.averageRating >= 3 ? 'text-warning' : 'text-error'"
                  >
                    {{ item.averageRating.toFixed(2) }}
                  </span>
                  <span v-else class="text-medium-emphasis">-</span>
                </template>

                <template #no-data>
                  <div class="text-center pa-4">
                    <p class="text-body-2 text-medium-emphasis">No professor data available</p>
                  </div>
                </template>
              </VDataTable>
            </VCard>

            <!-- Offices Table (for Office evaluations) -->
            <VCard v-if="form.evaluation_type === 'Office' && officesWithResponses.length > 0" variant="outlined" class="mb-6">
              <VCardTitle class="pa-4 text-subtitle-1">
                School Offices
              </VCardTitle>
              <VDivider />
              <VDataTable
                :headers="officeTableHeaders"
                :items="officesWithResponses"
                hover
                class="clickable-rows"
                density="comfortable"
                @click:row="(_event: Event, { item }: { item: any }) => openOfficeDetail(item)"
              >
                <template #item.name="{ item }">
                  <span class="font-weight-medium">{{ item.name }}</span>
                </template>

                <template #item.responseCount="{ item }">
                  {{ item.responseCount }}
                </template>

                <template #item.averageRating="{ item }">
                  <span
                    v-if="item.averageRating > 0"
                    class="font-weight-medium"
                    :class="item.averageRating >= 4 ? 'text-success' : item.averageRating >= 3 ? 'text-warning' : 'text-error'"
                  >
                    {{ item.averageRating.toFixed(2) }}
                  </span>
                  <span v-else class="text-medium-emphasis">-</span>
                </template>

                <template #no-data>
                  <div class="text-center pa-4">
                    <p class="text-body-2 text-medium-emphasis">No office data available</p>
                  </div>
                </template>
              </VDataTable>
            </VCard>

            <!-- Pending by Program -->
            <VCard v-if="pendingResponsesCount > 0 && pendingByProgram.length > 0" variant="outlined" class="mb-6">
              <VCardText class="pa-4">
                <div class="text-subtitle-2 mb-3">Pending by Program</div>
                <div class="text-body-2 text-medium-emphasis">
                  <span
                    v-for="(prog, index) in pendingByProgram"
                    :key="prog.id"
                  >{{ prog.name }}: {{ prog.count }}<span v-if="index < pendingByProgram.length - 1">, </span></span>
                </div>
              </VCardText>
            </VCard>

          </template>
        </VCardText>
      </template>
    </VCard>

    <!-- Export Report Dialog -->
    <VDialog v-model="isExportDialogOpen" max-width="900" scrollable>
      <VCard>
        <VCardTitle class="pa-6">
          Export Evaluation Report
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Step 1: Select Instructor -->
          <div class="mb-6">
            <p class="text-subtitle-2 mb-3">Select Instructor</p>
            <VSelect
              v-model="selectedInstructorForExport"
              :items="instructorsWithResponses"
              item-title="name"
              item-value="id"
              label="Instructor"
              variant="outlined"
              placeholder="Choose an instructor"
              @update:model-value="generateReport"
            >
              <template #item="{ item, props: itemProps }">
                <VListItem v-bind="itemProps">
                  <VListItemTitle>{{ item.raw.name }}</VListItemTitle>
                  <VListItemSubtitle>
                    {{ item.raw.classCount }} class(es) | {{ item.raw.responseCount }} responses
                  </VListItemSubtitle>
                </VListItem>
              </template>
            </VSelect>
          </div>

          <!-- Loading -->
          <div v-if="isGeneratingReport" class="text-center pa-8">
            <VProgressCircular indeterminate color="primary" />
            <p class="mt-4 text-medium-emphasis">Generating report...</p>
          </div>

          <!-- Report Preview -->
          <template v-else-if="currentInstructorReport">
            <VDivider class="mb-4" />

            <div class="report-preview">
              <!-- Report Header -->
              <VCard variant="outlined" class="mb-4">
                <VCardText class="pa-4">
                  <div class="d-flex flex-wrap align-center justify-space-between gap-4">
                    <div>
                      <p class="text-h6 font-weight-medium mb-1">{{ currentInstructorReport.instructorName }}</p>
                      <div class="text-body-2 text-medium-emphasis">
                        {{ currentInstructorReport.academicTerm || 'N/A' }} |
                        {{ currentInstructorReport.totalClasses }} class(es) |
                        {{ currentInstructorReport.totalRespondents }}/{{ currentInstructorReport.totalStudents }} responses |
                        {{ currentInstructorReport.responseRate }}% rate
                      </div>
                    </div>
                    <div class="text-right">
                      <p class="text-h4 font-weight-bold mb-0">{{ currentInstructorReport.overallAverage.toFixed(2) }}</p>
                      <p class="text-caption text-medium-emphasis">Overall Rating ({{ getVerbalInterpretation(currentInstructorReport.overallAverage) }})</p>
                    </div>
                  </div>
                </VCardText>
              </VCard>

              <!-- Classes Summary Table -->
              <VCard variant="outlined">
                <VCardText class="pa-0">
                  <VTable density="compact">
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Section</th>
                        <th class="text-center">Responses</th>
                        <th class="text-center">Rate</th>
                        <th class="text-center">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="classData in currentInstructorReport.classes" :key="classData.classId">
                        <td class="text-body-2">
                          <span class="font-weight-medium">{{ classData.courseCode }}</span>
                          <span class="text-medium-emphasis ms-1">{{ classData.courseName }}</span>
                        </td>
                        <td class="text-body-2">{{ classData.section }}</td>
                        <td class="text-center text-body-2">{{ classData.totalRespondents }}/{{ classData.totalStudents }}</td>
                        <td class="text-center text-body-2">{{ classData.responseRate }}%</td>
                        <td class="text-center">
                          <span
                            class="font-weight-medium"
                            :class="classData.overallAverage >= 4 ? 'text-success' : classData.overallAverage >= 3 ? 'text-warning' : 'text-error'"
                          >
                            {{ classData.overallAverage.toFixed(2) }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </VTable>
                </VCardText>
              </VCard>
            </div>
          </template>

          <!-- No Selection -->
          <div v-else class="text-center pa-8">
            <VIcon icon="ri-file-text-line" size="48" color="medium-emphasis" class="mb-4" />
            <p class="text-body-2 text-medium-emphasis">
              Select an instructor to preview the report
            </p>
          </div>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isExportDialogOpen = false">
            Close
          </VBtn>
          <VBtn
            v-if="currentInstructorReport"
            color="primary"
            prepend-icon="ri-printer-line"
            @click="printReport"
          >
            Print / Save as PDF
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Office Export Report Dialog -->
    <VDialog v-model="isOfficeExportDialogOpen" max-width="900" scrollable>
      <VCard>
        <VCardTitle class="pa-6">
          Office Evaluation Report
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Loading -->
          <div v-if="!currentOfficeReport" class="text-center pa-8">
            <VIcon icon="ri-file-text-line" size="48" color="medium-emphasis" class="mb-4" />
            <p class="text-body-2 text-medium-emphasis">
              No report data available
            </p>
          </div>

          <!-- Report Preview -->
          <template v-else>
            <div class="report-preview">
              <!-- Report Header -->
              <VCard variant="outlined" class="mb-4">
                <VCardText class="pa-4">
                  <div class="d-flex flex-wrap align-center justify-space-between gap-4">
                    <div>
                      <p class="text-h6 font-weight-medium mb-1">{{ currentOfficeReport.officeName }}</p>
                      <div class="text-body-2 text-medium-emphasis">
                        {{ currentOfficeReport.academicTerm || 'N/A' }} |
                        {{ currentOfficeReport.totalRespondents }}/{{ currentOfficeReport.totalExpected }} responses |
                        {{ currentOfficeReport.responseRate }}% rate
                      </div>
                    </div>
                    <div class="text-right">
                      <p class="text-h4 font-weight-bold mb-0">{{ currentOfficeReport.overallAverage.toFixed(2) }}</p>
                      <p class="text-caption text-medium-emphasis">Overall Rating ({{ getVerbalInterpretation(currentOfficeReport.overallAverage) }})</p>
                    </div>
                  </div>
                </VCardText>
              </VCard>

              <!-- Question Statistics Table -->
              <VCard variant="outlined">
                <VCardText class="pa-0">
                  <VTable density="compact">
                    <thead>
                      <tr>
                        <th>Group</th>
                        <th>Question</th>
                        <th class="text-center">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="group in currentOfficeReport.questionStats" :key="group.groupTitle">
                        <tr v-for="(q, qIdx) in group.questions" :key="`${group.groupTitle}-${qIdx}`">
                          <td class="text-body-2 text-medium-emphasis">{{ qIdx === 0 ? group.groupTitle : '' }}</td>
                          <td class="text-body-2">{{ q.questionText }}</td>
                          <td class="text-center">
                            <span
                              class="font-weight-medium"
                              :class="q.average >= 4 ? 'text-success' : q.average >= 3 ? 'text-warning' : 'text-error'"
                            >
                              {{ q.average.toFixed(2) }}
                            </span>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </VTable>
                </VCardText>
              </VCard>
            </div>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isOfficeExportDialogOpen = false">
            Close
          </VBtn>
          <VBtn
            v-if="currentOfficeReport"
            color="primary"
            variant="outlined"
            @click="exportOfficeReportAsCSV"
          >
            Export CSV
          </VBtn>
          <VBtn
            v-if="currentOfficeReport"
            color="primary"
            @click="printOfficeReport"
          >
            Print / Save as PDF
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

  </div>
</template>

<style scoped>
.clickable-rows :deep(tbody tr) {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.clickable-rows :deep(tbody tr:hover) {
  background-color: rgba(var(--v-theme-primary), 0.04) !important;
}

.transition-all {
  transition: all 0.2s ease;
}

.border-s-4 {
  border-left-width: 4px !important;
  border-left-style: solid !important;
}

.border-success {
  border-left-color: rgb(var(--v-theme-success)) !important;
}
</style>
