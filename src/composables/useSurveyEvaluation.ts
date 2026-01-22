// Composable for survey evaluation management
import type {
  SurveyEvaluationForm,
  StudentSurveyResponse,
  AcademicTerm,
  SchoolOffice,
  ClassItem,
  StudentItem,
  DepartmentSelectOption,
  QuestionStats,
  InstructorReportData,
  OfficeReportData,
  ClassEvaluationData,
} from '@/types'
import { SurveyService } from '@/services'
import { YEAR_LEVEL_OPTIONS } from '@/utils/constants'
import {
  selectRandomPercentage,
  calculateAverage,
  isRatingStyle,
  isOpenEndedStyle,
  getTeacherFullName,
  getStudentFullName,
  formatDateDisplay,
} from '@/utils/surveyHelpers'

export function useSurveyEvaluation(surveyId: Ref<number> | number) {
  const id = isRef(surveyId) ? surveyId : ref(surveyId)

  // Form state
  const form = ref<SurveyEvaluationForm>({
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
    question_group: [],
  })

  // Supporting data
  const academicTerms = ref<AcademicTerm[]>([])
  const schoolOffices = ref<SchoolOffice[]>([])
  const responseStyleOptions = ref<{ title: string; value: string }[]>([])

  // Class assignment state
  const availableClasses = ref<ClassItem[]>([])
  const assignedClassIds = ref<number[]>([])
  const classJunctionMapping = ref<Map<number, number>>(new Map())

  // Student assignment state
  const availableStudents = ref<StudentItem[]>([])
  const assignedStudentIds = ref<number[]>([])
  const studentJunctionMapping = ref<Map<number, number>>(new Map())

  // Department state
  const availableDepartments = ref<DepartmentSelectOption[]>([])
  const assignedDepartmentIds = ref<number[]>([])

  // Response state
  const responses = ref<StudentSurveyResponse[]>([])
  const questionStats = ref<QuestionStats[]>([])

  // Loading states
  const isLoading = ref(true)
  const isSaving = ref(false)
  const isLoadingResponses = ref(false)
  const isLoadingClasses = ref(false)
  const isLoadingStudents = ref(false)

  // Fetch survey data
  const fetchSurvey = async () => {
    isLoading.value = true
    const result = await SurveyService.getSurveyById(id.value)
    if (result.success && result.data) {
      const data = result.data
      // Handle relation fields that come back as objects - extract IDs
      form.value = {
        ...data,
        academic_term_id: typeof data.academic_term_id === 'object' && data.academic_term_id
          ? (data.academic_term_id as any).id
          : data.academic_term_id,
        office_id: typeof data.office_id === 'object' && data.office_id
          ? (data.office_id as any).id
          : data.office_id,
        question_group: data.question_group || [],
      }
    }
    isLoading.value = false
  }

  // Fetch supporting data
  const fetchSupportingData = async () => {
    const [termsResult, officesResult, styleOptions] = await Promise.all([
      SurveyService.getActiveAcademicTerms(),
      SurveyService.getActiveSchoolOffices(),
      SurveyService.getResponseStyleOptions(),
    ])

    academicTerms.value = termsResult.data
    schoolOffices.value = officesResult.data
    responseStyleOptions.value = styleOptions
  }

  // Fetch classes for assignment
  const fetchClasses = async () => {
    isLoadingClasses.value = true
    const [classesResult, assignedIds] = await Promise.all([
      SurveyService.getAvailableClasses(),
      SurveyService.getAssignedClassIds(id.value),
    ])
    availableClasses.value = classesResult.data
    assignedClassIds.value = assignedIds
    isLoadingClasses.value = false
  }

  // Fetch students for assignment
  const fetchStudents = async () => {
    isLoadingStudents.value = true
    const [studentsResult, assignedIds, deptsResult] = await Promise.all([
      SurveyService.getAvailableStudents(),
      SurveyService.getAssignedStudentIds(id.value),
      SurveyService.getDepartments(),
    ])
    availableStudents.value = studentsResult.data
    assignedStudentIds.value = assignedIds
    availableDepartments.value = deptsResult.data
    isLoadingStudents.value = false
  }

  // Fetch responses
  const fetchResponses = async () => {
    isLoadingResponses.value = true
    const result = await SurveyService.getSurveyResponses(id.value)
    responses.value = result.data
    calculateQuestionStats()
    isLoadingResponses.value = false
  }

  // Calculate question statistics
  const calculateQuestionStats = () => {
    const stats: QuestionStats[] = []

    for (const group of form.value.question_group) {
      for (const question of group.questions || []) {
        if (!question.id) continue

        const questionAnswers = responses.value
          .flatMap(r => r.answers || [])
          .filter(a => {
            const qId = typeof a.question_id === 'object' ? a.question_id.id : a.question_id
            return qId === question.id
          })

        const stat: QuestionStats = {
          questionId: question.id,
          questionText: question.question,
          responseStyle: group.response_style,
          totalResponses: questionAnswers.length,
        }

        if (isRatingStyle(group.response_style)) {
          const numericValues = questionAnswers
            .map(a => parseFloat(a.answer_value))
            .filter(v => !isNaN(v))

          stat.average = calculateAverage(numericValues)
          stat.distribution = {}
          for (const val of numericValues) {
            const key = String(Math.round(val))
            stat.distribution[key] = (stat.distribution[key] || 0) + 1
          }
        }

        stats.push(stat)
      }
    }

    questionStats.value = stats
  }

  // Save survey
  const saveSurvey = async () => {
    isSaving.value = true
    const result = await SurveyService.saveSurvey(id.value, form.value)

    if (result.success) {
      // Save class assignments for class-based surveys
      if (form.value.evaluation_type === 'Class') {
        await saveClassAssignments()
      }
      else {
        // Save student assignments for office-based surveys
        await saveStudentAssignments()
      }
    }

    isSaving.value = false
    return result
  }

  // Save class assignments
  const saveClassAssignments = async () => {
    const classesWithStudents = await SurveyService.getClassesWithStudents(assignedClassIds.value)

    // Collect all students from assigned classes
    const allStudentIds: number[] = []
    for (const cls of classesWithStudents.data) {
      const studentIds = (cls as any).student_id || []
      for (const s of studentIds) {
        const studentId = typeof s === 'number' ? s : (s.students_id || s.id)
        if (studentId && !allStudentIds.includes(studentId)) {
          allStudentIds.push(studentId)
        }
      }
    }

    // Apply percentage selection
    const selectedStudents = selectRandomPercentage(allStudentIds, form.value.student_percentage, id.value)
    await SurveyService.updateStudentAssignments(id.value, selectedStudents, studentJunctionMapping.value)
    await SurveyService.updateClassAssignments(id.value, [], assignedClassIds.value, classJunctionMapping.value)
  }

  // Save student assignments for office surveys
  const saveStudentAssignments = async () => {
    let studentsToAssign: number[] = []

    switch (form.value.assignment_mode) {
      case 'all': {
        const result = await SurveyService.getStudentsWithClasses()
        studentsToAssign = result.data.map(s => s.id)
        break
      }
      case 'department': {
        studentsToAssign = availableStudents.value
          .filter(s => s.deparment_id && assignedDepartmentIds.value.includes(s.deparment_id))
          .map(s => s.id)
        break
      }
      case 'specific': {
        studentsToAssign = assignedStudentIds.value
        break
      }
    }

    // Apply percentage selection
    const selectedStudents = selectRandomPercentage(studentsToAssign, form.value.student_percentage, id.value)
    await SurveyService.updateStudentAssignments(id.value, selectedStudents, studentJunctionMapping.value)
  }

  // Helper: Get student count from class (handles junction table)
  const getClassStudentCount = (cls: ClassItem): number => {
    const studentIds = (cls as any).student_id
    if (!studentIds || !Array.isArray(studentIds)) return 0

    const uniqueStudentIds = new Set<number>()
    for (const item of studentIds) {
      let studentId: number | null = null
      if (typeof item === 'number') {
        studentId = item
      }
      else if (typeof item === 'object' && item !== null) {
        studentId = item.students_id || item.id || null
      }
      if (studentId !== null) {
        uniqueStudentIds.add(studentId)
      }
    }
    return uniqueStudentIds.size
  }

  // Computed: Total assigned students for class-based surveys
  const totalAssignedStudentsClass = computed(() => {
    return availableClasses.value
      .filter(cls => assignedClassIds.value.includes(cls.id!))
      .reduce((total, cls) => total + getClassStudentCount(cls), 0)
  })

  // Computed: Total assigned students for office-based surveys
  const totalAssignedStudentsOffice = computed(() => {
    switch (form.value.assignment_mode) {
      case 'all':
        return availableStudents.value.length
      case 'department':
        return availableStudents.value.filter(
          s => s.deparment_id && assignedDepartmentIds.value.includes(s.deparment_id),
        ).length
      case 'specific':
        return assignedStudentIds.value.length
      default:
        return 0
    }
  })

  // Computed: Total expected students
  const totalExpectedStudents = computed(() => {
    const base = form.value.evaluation_type === 'Class'
      ? totalAssignedStudentsClass.value
      : totalAssignedStudentsOffice.value
    return Math.ceil(base * (form.value.student_percentage / 100))
  })

  // Computed: Pending responses count
  const pendingResponsesCount = computed(() => {
    return Math.max(0, totalExpectedStudents.value - responses.value.length)
  })

  // Computed: Responses grouped by year level
  const responsesByYearLevel = computed(() => {
    const groups: Record<string, { responses: StudentSurveyResponse[]; averageRating: number }> = {}

    // Initialize all year levels
    for (const yl of YEAR_LEVEL_OPTIONS) {
      groups[yl.value] = { responses: [], averageRating: 0 }
    }

    // Group responses
    for (const response of responses.value) {
      const yearLevel = response.year_level || 'Unknown'
      if (!groups[yearLevel]) {
        groups[yearLevel] = { responses: [], averageRating: 0 }
      }
      groups[yearLevel].responses.push(response)
    }

    // Calculate average rating per year level
    for (const yearLevel of Object.keys(groups)) {
      const yearResponses = groups[yearLevel].responses
      if (yearResponses.length === 0) continue

      const allRatings: number[] = []
      for (const response of yearResponses) {
        for (const answer of response.answers || []) {
          const val = parseFloat(answer.answer_value)
          if (!isNaN(val) && val >= 1 && val <= 5) {
            allRatings.push(val)
          }
        }
      }
      groups[yearLevel].averageRating = calculateAverage(allRatings)
    }

    return groups
  })

  // Computed: Instructors with responses (for class-based surveys)
  const instructorsWithResponses = computed(() => {
    if (form.value.evaluation_type !== 'Class') return []

    const instructorMap = new Map<number, {
      id: number
      name: string
      classCount: number
      responseCount: number
      totalRating: number
      ratingCount: number
    }>()

    for (const cls of availableClasses.value) {
      if (!assignedClassIds.value.includes(cls.id!)) continue
      if (!cls.teacher_id || typeof cls.teacher_id !== 'object') continue

      const teacherId = cls.teacher_id.id
      const teacherName = getTeacherFullName(cls.teacher_id)

      if (!instructorMap.has(teacherId)) {
        instructorMap.set(teacherId, {
          id: teacherId,
          name: teacherName,
          classCount: 0,
          responseCount: 0,
          totalRating: 0,
          ratingCount: 0,
        })
      }

      const instructor = instructorMap.get(teacherId)!
      instructor.classCount++

      // Count responses for this class
      const classResponses = responses.value.filter(r => r.class_id === cls.id)
      instructor.responseCount += classResponses.length

      // Calculate ratings
      for (const response of classResponses) {
        for (const answer of response.answers || []) {
          const val = parseFloat(answer.answer_value)
          if (!isNaN(val) && val >= 1 && val <= 5) {
            instructor.totalRating += val
            instructor.ratingCount++
          }
        }
      }
    }

    return Array.from(instructorMap.values()).map(i => ({
      id: i.id,
      name: i.name,
      classCount: i.classCount,
      responseCount: i.responseCount,
      averageRating: i.ratingCount > 0 ? i.totalRating / i.ratingCount : 0,
    }))
  })

  // Generate instructor report
  const generateInstructorReport = (instructorId: number): InstructorReportData | null => {
    const instructor = instructorsWithResponses.value.find(i => i.id === instructorId)
    if (!instructor) return null

    const instructorClasses = availableClasses.value.filter(cls => {
      if (!assignedClassIds.value.includes(cls.id!)) return false
      if (!cls.teacher_id || typeof cls.teacher_id !== 'object') return false
      return cls.teacher_id.id === instructorId
    })

    const classes: ClassEvaluationData[] = []
    let totalRespondents = 0
    let totalStudents = 0

    for (const cls of instructorClasses) {
      const classResponses = responses.value.filter(r => r.class_id === cls.id)
      const studentCount = getClassStudentCount(cls)

      totalRespondents += classResponses.length
      totalStudents += studentCount

      const classData: ClassEvaluationData = {
        classId: cls.id!,
        section: cls.section,
        courseCode: (cls.course_id as any)?.courseCode || '',
        courseName: (cls.course_id as any)?.courseName || '',
        totalRespondents: classResponses.length,
        totalStudents: studentCount,
        responseRate: studentCount > 0 ? (classResponses.length / studentCount) * 100 : 0,
        overallAverage: 0,
        questionStats: [],
        comments: [],
      }

      // Calculate per-group stats
      const allRatings: number[] = []
      for (const group of form.value.question_group) {
        const groupStats = {
          groupTitle: group.title,
          questions: [] as { questionText: string; average: number; distribution: Record<string, number>; totalResponses: number }[],
        }

        for (const question of group.questions || []) {
          const qAnswers = classResponses
            .flatMap(r => r.answers || [])
            .filter(a => {
              const qId = typeof a.question_id === 'object' ? a.question_id.id : a.question_id
              return qId === question.id
            })

          if (isRatingStyle(group.response_style)) {
            const values = qAnswers.map(a => parseFloat(a.answer_value)).filter(v => !isNaN(v))
            allRatings.push(...values)
            groupStats.questions.push({
              questionText: question.question,
              average: calculateAverage(values),
              distribution: {},
              totalResponses: values.length,
            })
          }
          else if (isOpenEndedStyle(group.response_style)) {
            for (const a of qAnswers) {
              if (a.answer_value?.trim()) {
                classData.comments.push(a.answer_value)
              }
            }
          }
        }

        if (groupStats.questions.length > 0) {
          classData.questionStats.push(groupStats)
        }
      }

      classData.overallAverage = calculateAverage(allRatings)
      classes.push(classData)
    }

    const academicTerm = academicTerms.value.find(t => t.id === form.value.academic_term_id)

    return {
      instructorId,
      instructorName: instructor.name,
      academicTerm: academicTerm ? `${academicTerm.schoolYear} - ${academicTerm.semester}` : '',
      totalClasses: classes.length,
      totalRespondents,
      totalStudents,
      overallAverage: instructor.averageRating,
      responseRate: totalStudents > 0 ? (totalRespondents / totalStudents) * 100 : 0,
      classes,
    }
  }

  // Generate office report
  const generateOfficeReport = (): OfficeReportData | null => {
    if (form.value.evaluation_type !== 'Office') return null

    const office = schoolOffices.value.find(o => o.id === form.value.office_id)
    if (!office) return null

    const academicTerm = academicTerms.value.find(t => t.id === form.value.academic_term_id)

    const report: OfficeReportData = {
      officeId: office.id!,
      officeName: office.name,
      surveyTitle: form.value.title,
      academicTerm: academicTerm ? `${academicTerm.schoolYear} - ${academicTerm.semester}` : '',
      totalRespondents: responses.value.length,
      totalExpected: totalExpectedStudents.value,
      responseRate: totalExpectedStudents.value > 0 ? (responses.value.length / totalExpectedStudents.value) * 100 : 0,
      overallAverage: 0,
      questionStats: [],
      comments: [],
      responses: [],
    }

    const allRatings: number[] = []

    for (const group of form.value.question_group) {
      const groupStats = {
        groupTitle: group.title,
        questions: [] as { questionText: string; average: number; distribution: Record<string, number>; totalResponses: number }[],
      }

      for (const question of group.questions || []) {
        const qAnswers = responses.value
          .flatMap(r => r.answers || [])
          .filter(a => {
            const qId = typeof a.question_id === 'object' ? a.question_id.id : a.question_id
            return qId === question.id
          })

        if (isRatingStyle(group.response_style)) {
          const values = qAnswers.map(a => parseFloat(a.answer_value)).filter(v => !isNaN(v))
          allRatings.push(...values)
          groupStats.questions.push({
            questionText: question.question,
            average: calculateAverage(values),
            distribution: {},
            totalResponses: values.length,
          })
        }
        else if (isOpenEndedStyle(group.response_style)) {
          for (const a of qAnswers) {
            if (a.answer_value?.trim()) {
              report.comments.push(a.answer_value)
            }
          }
        }
      }

      if (groupStats.questions.length > 0) {
        report.questionStats.push(groupStats)
      }
    }

    report.overallAverage = calculateAverage(allRatings)

    // Build individual response details
    for (const response of responses.value) {
      const student = typeof response.student_id === 'object' ? response.student_id : null
      if (!student) continue

      report.responses.push({
        studentName: getStudentFullName(student),
        studentNumber: student.student_number,
        program: '', // Would need department lookup
        submittedAt: formatDateDisplay(response.submitted_at),
        answers: (response.answers || []).map(a => {
          const question = typeof a.question_id === 'object' ? a.question_id : null
          const group = form.value.question_group.find(g =>
            g.questions?.some(q => q.id === (question?.id || a.question_id)),
          )
          return {
            groupTitle: group?.title || '',
            questionText: question?.question || '',
            answerValue: a.answer_value,
            responseStyle: group?.response_style || '',
          }
        }),
      })
    }

    return report
  }

  return {
    // State
    form,
    academicTerms,
    schoolOffices,
    responseStyleOptions,
    availableClasses,
    assignedClassIds,
    availableStudents,
    assignedStudentIds,
    availableDepartments,
    assignedDepartmentIds,
    responses,
    questionStats,

    // Loading states
    isLoading,
    isSaving,
    isLoadingResponses,
    isLoadingClasses,
    isLoadingStudents,

    // Actions
    fetchSurvey,
    fetchSupportingData,
    fetchClasses,
    fetchStudents,
    fetchResponses,
    saveSurvey,

    // Computed
    totalAssignedStudentsClass,
    totalAssignedStudentsOffice,
    totalExpectedStudents,
    pendingResponsesCount,
    responsesByYearLevel,
    instructorsWithResponses,

    // Report generators
    generateInstructorReport,
    generateOfficeReport,
  }
}
