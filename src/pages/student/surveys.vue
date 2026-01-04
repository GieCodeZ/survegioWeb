<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'StudentSurveys',
    allowedRoles: ['student'],
  },
})

// ==================== INTERFACES ====================

interface StudentQuestion {
  id: number
  question: string
  sort?: number
}

interface StudentQuestionGroup {
  id: number
  number: number
  title: string
  response_style: string
  questions?: StudentQuestion[]
}

interface SchoolOffice {
  id: number
  name: string
  description?: string
}

interface StudentSurvey {
  id: number
  title: string
  instruction?: string
  is_active: string
  evaluation_type?: 'Class' | 'Office'
  office_id?: SchoolOffice | number | null
  assignment_mode?: 'all' | 'department' | 'specific'
  target_year_levels?: string[] | null
  students?: { students_id: number }[]
  classes?: any[]
  question_group?: StudentQuestionGroup[]
}

interface Teacher {
  id: number
  first_name: string
  last_name: string
}

interface ClassInfo {
  id: number
  section: string
  course_id?: { id: number; courseCode: string; courseName: string } | null
  teacher_id?: Teacher | number | null
}

interface PendingEvaluation {
  survey: StudentSurvey
  classInfo?: ClassInfo
  office?: SchoolOffice
  teacher?: Teacher
  isCompleted: boolean
  evaluationType: 'class' | 'office'
}

interface CompletedResponse {
  id: number
  survey_id: number
  surveyTitle: string
  classId?: number
  className?: string
  officeId?: number
  officeName?: string
  evaluationType: 'class' | 'office'
  submitted_at: string
  questionsAnswered?: number
  studentName?: string
  studentNumber?: string
  program?: string
}

// ==================== STATE ====================

const isLoading = ref(true)
const activeTab = ref('pending')
const pendingEvaluations = ref<PendingEvaluation[]>([])
const completedResponses = ref<CompletedResponse[]>([])
const studentClasses = ref<ClassInfo[]>([])
const studentDepartmentId = ref<number | null>(null)
const studentYearLevel = ref<number | null>(null)

// Error/info state
const hasError = ref(false)
const errorMessage = ref('')

// Snackbar
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Ticket dialog
const showTicketDialog = ref(false)
const selectedTicket = ref<CompletedResponse | null>(null)

const viewTicket = (response: CompletedResponse) => {
  selectedTicket.value = response
  showTicketDialog.value = true
}

// ==================== COMPUTED ====================

const pendingCount = computed(() => pendingEvaluations.value.filter(e => !e.isCompleted).length)
const completedCount = computed(() => completedResponses.value.length)

// ==================== FETCH FUNCTIONS ====================

const fetchData = async () => {
  isLoading.value = true
  hasError.value = false
  errorMessage.value = ''

  try {
    // Get student ID from cookie
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id

    if (!sid) {
      hasError.value = true
      errorMessage.value = 'Student ID not found. Please log out and log in again. Make sure your email matches a student record in the system.'
      isLoading.value = false
      return
    }

    await fetchStudentClasses()
    await Promise.all([
      fetchPendingEvaluations(),
      fetchCompletedResponses(),
    ])
  }
  catch (error) {
    console.error('Failed to fetch data:', error)
    hasError.value = true
    errorMessage.value = 'Failed to load evaluation data. Please try again.'
  }
  finally {
    isLoading.value = false
  }
}

// Fetch classes the student is enrolled in and student's department
const fetchStudentClasses = async () => {
  try {
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id

    if (!sid) {
      studentClasses.value = []
      studentDepartmentId.value = null
      return
    }

    // Fetch student's department and year_level
    try {
      const studentRes = await $api(`/items/students/${sid}`, {
        params: {
          fields: ['deparment_id', 'year_level'],
        },
      })
      const deptId = studentRes.data?.deparment_id
      studentDepartmentId.value = typeof deptId === 'object' ? deptId?.id : deptId
      studentYearLevel.value = studentRes.data?.year_level || null
    }
    catch (err) {
      console.error('Failed to fetch student data:', err)
      studentDepartmentId.value = null
      studentYearLevel.value = null
    }

    // student_id is a junction table (M2M): classes -> classes_students -> students
    const res = await $api('/items/classes', {
      params: {
        filter: {
          student_id: {
            students_id: { _eq: sid },
          },
        },
        fields: ['id', 'section', 'course_id.*', 'teacher_id.*'],
      },
    })

    studentClasses.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch student classes:', error)
  }
}

// Fetch pending evaluations (both class-based and office-based)
const fetchPendingEvaluations = async () => {
  try {
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id ? Number(userData.student_id) : null

    if (!sid) {
      pendingEvaluations.value = []
      return
    }

    // Fetch all active surveys with their assigned classes and office info
    const res = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          '*',
          'target_year_levels',
          // Office info
          'office_id.id',
          'office_id.name',
          // Student assignment for office-based surveys
          'students.students_id',
          // Junction table format for classes
          'classes.id',
          'classes.classes_id.id',
          'classes.classes_id.section',
          'classes.classes_id.teacher_id.id',
          'classes.classes_id.teacher_id.first_name',
          'classes.classes_id.teacher_id.last_name',
          'classes.classes_id.course_id.id',
          'classes.classes_id.course_id.courseCode',
          'classes.classes_id.course_id.courseName',
          // Question groups
          'question_group.*',
          'question_group.questions.*',
        ],
      },
    })

    const allSurveys: StudentSurvey[] = res.data

    // Get completed responses for this student (survey_id + class_id or office_id combinations)
    interface CompletedEvaluation {
      surveyId: number
      classId: number | null
      officeId: number | null
    }
    let completedEvaluations: CompletedEvaluation[] = []
    try {
      const completedRes = await $api('/items/StudentSurveyResponses', {
        params: {
          filter: { student_id: { _eq: sid } },
          fields: ['survey_id', 'class_id', 'office_id'],
        },
      })
      completedEvaluations = (completedRes.data || []).map((r: any) => ({
        surveyId: typeof r.survey_id === 'object' ? r.survey_id?.id : r.survey_id,
        classId: typeof r.class_id === 'object' ? r.class_id?.id : r.class_id,
        officeId: typeof r.office_id === 'object' ? r.office_id?.id : r.office_id,
      }))
    }
    catch (err) {
      console.error('Failed to fetch completed responses:', err)
    }

    // Build pending evaluations
    const evaluations: PendingEvaluation[] = []

    for (const survey of allSurveys) {
      // Check year level targeting - skip if survey targets specific year levels and student doesn't match
      const targetYearLevels = survey.target_year_levels
      if (targetYearLevels && targetYearLevels.length > 0) {
        // Survey targets specific year levels
        if (!studentYearLevel.value || !targetYearLevels.includes(studentYearLevel.value)) {
          // Student's year level doesn't match - skip this survey
          continue
        }
      }
      // If targetYearLevels is null/empty, survey applies to all year levels

      const evaluationType = (survey.evaluation_type || 'Class').toLowerCase() as 'class' | 'office'

      if (evaluationType === 'office') {
        // Office-based survey logic
        const office = typeof survey.office_id === 'object' && survey.office_id
          ? survey.office_id as SchoolOffice
          : null

        if (!office) continue

        // Check if student is eligible based on assignment_mode
        let isEligible = false
        const assignmentMode = survey.assignment_mode || 'all'

        if (assignmentMode === 'all') {
          // All students with at least one enrolled class
          isEligible = studentClasses.value.length > 0
        }
        else if (assignmentMode === 'department' || assignmentMode === 'specific') {
          // For both 'department' and 'specific' modes, students are saved to the junction table
          const assignedStudentIds = (survey.students || []).map((s: any) => Number(s.students_id))
          isEligible = assignedStudentIds.includes(sid)
        }

        if (!isEligible) continue

        // Check if already completed
        const isCompleted = completedEvaluations.some(
          c => c.surveyId === survey.id && c.officeId === office.id,
        )

        if (!isCompleted) {
          evaluations.push({
            survey,
            office,
            isCompleted: false,
            evaluationType: 'office',
          })
        }
      }
      else {
        // Class-based survey logic (existing)
        const surveyClasses = survey.classes || []

        // Extract class data from junction table
        const surveyClassData = surveyClasses.map((junctionEntry: any) => {
          const classData = junctionEntry?.classes_id
          if (!classData) return null

          if (typeof classData === 'object') {
            return {
              id: classData.id,
              section: classData.section,
              teacher_id: classData.teacher_id,
              course_id: classData.course_id,
            }
          }
          return { id: classData }
        }).filter((c: any) => c !== null)

        const surveyClassIds = surveyClassData.map((c: any) => c.id)

        // Find intersection of survey classes and student's classes
        const matchingStudentClasses = studentClasses.value.filter(sc => surveyClassIds.includes(sc.id))

        for (const studentClass of matchingStudentClasses) {
          // Check if this survey + class combination is already completed
          const isCompleted = completedEvaluations.some(
            c => c.surveyId === survey.id && c.classId === studentClass.id,
          )

          if (!isCompleted) {
            // Get teacher info
            let teacher: Teacher | undefined
            if (typeof studentClass.teacher_id === 'object' && studentClass.teacher_id) {
              teacher = studentClass.teacher_id as Teacher
            }

            // Fallback: try to get teacher from survey junction data
            if (!teacher) {
              const surveyClassEntry = surveyClassData.find((c: any) => c.id === studentClass.id)
              if (surveyClassEntry?.teacher_id && typeof surveyClassEntry.teacher_id === 'object') {
                teacher = surveyClassEntry.teacher_id as Teacher
              }
            }

            evaluations.push({
              survey,
              classInfo: studentClass,
              teacher,
              isCompleted: false,
              evaluationType: 'class',
            })
          }
        }
      }
    }

    pendingEvaluations.value = evaluations
  }
  catch (error) {
    console.error('Failed to fetch pending evaluations:', error)
    pendingEvaluations.value = []
  }
}

// Fetch completed responses
const fetchCompletedResponses = async () => {
  try {
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id

    if (!studentId) {
      completedResponses.value = []
      return
    }

    // Fetch student data first
    let studentData: any = null
    try {
      const studentRes = await $api(`/items/students/${studentId}`, {
        params: {
          fields: ['first_name', 'last_name', 'student_number', 'deparment_id.name.programName'],
        },
      })
      studentData = studentRes.data
    }
    catch (err) {
      console.error('Failed to fetch student data:', err)
    }

    const res = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { student_id: { _eq: studentId } },
        fields: [
          'id',
          'survey_id.id',
          'survey_id.title',
          'survey_id.evaluation_type',
          'class_id.id',
          'class_id.section',
          'class_id.course_id.courseCode',
          'class_id.course_id.courseName',
          'office_id.id',
          'office_id.name',
          'submitted_at',
          'answers.id',
        ],
        sort: ['-submitted_at'],
      },
    })

    completedResponses.value = (res.data).map((r: any) => {
      const classData = r.class_id
      const officeData = r.office_id
      const courseCode = classData?.course_id?.courseCode
      const courseName = classData?.course_id?.courseName
      const rawEvalType = r.survey_id?.evaluation_type || (officeData ? 'Office' : 'Class')
      const evalType = rawEvalType.toLowerCase() as 'class' | 'office'

      return {
        id: r.id,
        survey_id: typeof r.survey_id === 'object' ? r.survey_id.id : r.survey_id,
        surveyTitle: typeof r.survey_id === 'object' ? r.survey_id.title : `Survey #${r.survey_id}`,
        classId: classData?.id,
        className: courseCode && courseName ? `${courseCode} - ${courseName}` : courseCode || courseName || undefined,
        officeId: officeData?.id,
        officeName: officeData?.name,
        evaluationType: evalType,
        submitted_at: r.submitted_at,
        questionsAnswered: r.answers?.length,
        studentName: studentData ? `${studentData.first_name} ${studentData.last_name}`.trim() : '',
        studentNumber: studentData?.student_number,
        program: typeof studentData?.deparment_id?.name === 'object' && studentData.deparment_id.name?.programName ? studentData.deparment_id.name.programName : '',
      }
    })
  }
  catch (error) {
    console.error('Failed to fetch completed responses:', error)
    completedResponses.value = []
  }
}

// ==================== NAVIGATION ====================

const router = useRouter()

const openSurvey = (evaluation: PendingEvaluation) => {
  if (evaluation.evaluationType === 'office' && evaluation.office) {
    router.push(`/student/surveys-${evaluation.survey.id}?office=${evaluation.office.id}`)
  }
  else if (evaluation.classInfo) {
    router.push(`/student/surveys-${evaluation.survey.id}?class=${evaluation.classInfo.id}`)
  }
}

// ==================== HELPERS ====================

const getTeacherName = (teacher?: Teacher): string => {
  if (!teacher) return ''
  return `${teacher.first_name} ${teacher.last_name}`
}

const getClassName = (classInfo?: ClassInfo): string => {
  if (!classInfo) return ''
  const courseCode = typeof classInfo.course_id === 'object' && classInfo.course_id
    ? classInfo.course_id.courseCode
    : ''
  return `${courseCode} - ${classInfo.section}`
}

const getEvaluationTarget = (evaluation: PendingEvaluation): string => {
  if (evaluation.evaluationType === 'office' && evaluation.office) {
    return evaluation.office.name
  }
  return getClassName(evaluation.classInfo)
}

const getQuestionCount = (survey: StudentSurvey): number => {
  return (survey.question_group || []).reduce((acc, g) => acc + (g.questions?.length ?? 0), 0)
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return ''
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

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h4 class="text-h4 mb-1">My Evaluations</h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Evaluate your classes and school offices, and view your submission history
        </p>
      </div>
      <VBtn
        variant="tonal"
        color="primary"
        :loading="isLoading"
        @click="fetchData"
      >
        <VIcon icon="ri-refresh-line" class="me-1" />
        Refresh
      </VBtn>
    </div>

    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading evaluations...</span>
      </VCardText>
    </VCard>

    <!-- Error Alert -->
    <VAlert
      v-else-if="hasError"
      type="warning"
      variant="tonal"
      class="mb-6"
    >
      <template #title>Unable to Load Evaluations</template>
      {{ errorMessage }}
    </VAlert>

    <template v-else>
      <!-- Info alert when no classes assigned -->
      <VAlert
        v-if="studentClasses.length === 0"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        <template #title>No Classes Found</template>
        You are not currently enrolled in any classes. Please contact your administrator if you believe this is an error.
      </VAlert>

      <VCard>
        <VTabs v-model="activeTab" grow>
          <VTab value="pending">
            <VIcon icon="ri-time-line" class="me-2" />
            Pending
            <VBadge
              v-if="pendingCount > 0"
              :content="pendingCount"
              color="warning"
              inline
              class="ms-2"
            />
          </VTab>
          <VTab value="completed">
            <VIcon icon="ri-check-double-line" class="me-2" />
            Completed
            <VBadge
              v-if="completedCount > 0"
              :content="completedCount"
              color="success"
              inline
              class="ms-2"
            />
          </VTab>
        </VTabs>

        <VDivider />

        <VWindow v-model="activeTab">
          <!-- Pending Evaluations -->
          <VWindowItem value="pending">
            <VCardText v-if="pendingCount === 0" class="text-center pa-12">
              <VIcon icon="ri-checkbox-circle-line" size="64" color="success" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">All caught up!</p>
              <p class="text-body-2 text-medium-emphasis">You have no pending evaluations.</p>
            </VCardText>

            <template v-else>
              <VTable>
                <thead>
                  <tr>
                    <th>Survey</th>
                    <th>Type</th>
                    <th>Target</th>
                    <th>Questions</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="evaluation in pendingEvaluations.filter(e => !e.isCompleted)"
                    :key="`${evaluation.survey.id}-${evaluation.classInfo?.id || evaluation.office?.id}`"
                  >
                    <td>{{ evaluation.survey.title }}</td>
                    <td>
                      <VChip
                        :color="evaluation.evaluationType === 'office' ? 'info' : 'primary'"
                        size="small"
                        variant="tonal"
                      >
                        <VIcon
                          :icon="evaluation.evaluationType === 'office' ? 'ri-building-line' : 'ri-book-line'"
                          size="14"
                          class="me-1"
                        />
                        {{ evaluation.evaluationType === 'office' ? 'Office' : 'Class' }}
                      </VChip>
                    </td>
                    <td>
                      <div v-if="evaluation.evaluationType === 'office'">
                        <span class="font-weight-medium">{{ evaluation.office?.name }}</span>
                      </div>
                      <div v-else>
                        <span class="font-weight-medium">{{ getClassName(evaluation.classInfo) }}</span>
                        <div class="text-caption text-medium-emphasis">{{ getTeacherName(evaluation.teacher) }}</div>
                      </div>
                    </td>
                    <td>{{ getQuestionCount(evaluation.survey) }}</td>
                    <td class="text-center">
                      <VBtn
                        color="primary"
                        size="small"
                        @click="openSurvey(evaluation)"
                      >
                        Evaluate
                      </VBtn>
                    </td>
                  </tr>
                </tbody>
              </VTable>
            </template>
          </VWindowItem>

          <!-- Completed Responses -->
          <VWindowItem value="completed">
            <VCardText v-if="completedResponses.length === 0" class="text-center pa-12">
              <VIcon icon="ri-inbox-line" size="64" color="medium-emphasis" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">No completed evaluations</p>
              <p class="text-body-2 text-medium-emphasis">Your completed evaluations will appear here.</p>
            </VCardText>

            <VTable v-else>
              <thead>
                <tr>
                  <th>Survey</th>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Submitted</th>
                  <th class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="response in completedResponses" :key="response.id">
                  <td>
                    <div class="d-flex align-center gap-2">
                      <VAvatar size="32" color="success" variant="tonal">
                        <VIcon icon="ri-check-line" size="16" />
                      </VAvatar>
                      <span class="font-weight-medium">{{ response.surveyTitle }}</span>
                    </div>
                  </td>
                  <td>
                    <VChip
                      :color="response.evaluationType === 'office' ? 'info' : 'primary'"
                      size="small"
                      variant="tonal"
                    >
                      {{ response.evaluationType === 'office' ? 'Office' : 'Class' }}
                    </VChip>
                  </td>
                  <td>{{ response.evaluationType === 'office' ? response.officeName : response.className }}</td>
                  <td>{{ formatDate(response.submitted_at) }}</td>
                  <td class="text-center">
                    <VBtn
                      icon
                      variant="text"
                      size="small"
                      color="primary"
                      @click="viewTicket(response)"
                    >
                      <VIcon icon="ri-eye-line" size="20" />
                      <VTooltip activator="parent" location="top">View Ticket</VTooltip>
                    </VBtn>
                  </td>
                </tr>
              </tbody>
            </VTable>
          </VWindowItem>
        </VWindow>
      </VCard>
    </template>

    <!-- Snackbar -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="4000"
      location="top"
    >
      {{ snackbar.message }}
      <template #actions>
        <VBtn variant="text" @click="snackbar.show = false">
          Close
        </VBtn>
      </template>
    </VSnackbar>

    <!-- Ticket View Dialog -->
    <VDialog v-model="showTicketDialog" max-width="500">
      <VCard v-if="selectedTicket">
        <VCardText class="text-center pa-8">
          <!-- Success Icon -->
          <VAvatar size="80" color="success" class="mb-4">
            <VIcon icon="ri-check-line" size="48" color="white" />
          </VAvatar>

          <h4 class="text-h4 mb-2">Evaluation Complete</h4>
          <p class="text-body-1 text-medium-emphasis mb-6">
            This evaluation was submitted successfully.
          </p>

          <!-- Ticket Details -->
          <VCard variant="outlined" class="text-left mb-6">
            <VCardText>
              <div class="d-flex align-center justify-space-between mb-3">
                <span class="text-caption text-medium-emphasis">Reference No.</span>
                <span class="font-weight-bold text-primary">#{{ selectedTicket.id }}</span>
              </div>
              <VDivider class="mb-3" />

              <!-- Student Information -->
              <p class="text-caption text-medium-emphasis mb-2">STUDENT INFORMATION</p>
              <div class="d-flex flex-column gap-2 mb-4">
                <div v-if="selectedTicket.studentName" class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Name</span>
                  <span class="text-body-2 font-weight-medium">{{ selectedTicket.studentName }}</span>
                </div>
                <div v-if="selectedTicket.studentNumber" class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Student ID</span>
                  <span class="text-body-2 font-weight-medium">{{ selectedTicket.studentNumber }}</span>
                </div>
                <div v-if="selectedTicket.program" class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Program</span>
                  <span class="text-body-2 font-weight-medium">{{ selectedTicket.program }}</span>
                </div>
              </div>

              <VDivider class="mb-3" />

              <!-- Survey Information -->
              <p class="text-caption text-medium-emphasis mb-2">SURVEY INFORMATION</p>
              <div class="d-flex flex-column gap-2">
                <div class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Survey</span>
                  <span class="text-body-2 font-weight-medium">{{ selectedTicket.surveyTitle }}</span>
                </div>
                <div class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Type</span>
                  <VChip
                    :color="selectedTicket.evaluationType === 'office' ? 'info' : 'primary'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ selectedTicket.evaluationType === 'office' ? 'Office Evaluation' : 'Class Evaluation' }}
                  </VChip>
                </div>
                <div v-if="selectedTicket.evaluationType === 'office' && selectedTicket.officeName" class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Office</span>
                  <span class="text-body-2 font-weight-medium">{{ selectedTicket.officeName }}</span>
                </div>
                <div v-if="selectedTicket.evaluationType === 'class' && selectedTicket.className" class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Course</span>
                  <span class="text-body-2 font-weight-medium">{{ selectedTicket.className }}</span>
                </div>
                <div v-if="selectedTicket.questionsAnswered" class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Questions Answered</span>
                  <span class="text-body-2 font-weight-medium">{{ selectedTicket.questionsAnswered }}</span>
                </div>
                <div class="d-flex justify-space-between">
                  <span class="text-body-2 text-medium-emphasis">Submitted At</span>
                  <span class="text-body-2 font-weight-medium">{{ formatDate(selectedTicket.submitted_at) }}</span>
                </div>
              </div>
            </VCardText>
          </VCard>

          <VBtn color="primary" size="large" block @click="showTicketDialog = false">
            Close
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>
