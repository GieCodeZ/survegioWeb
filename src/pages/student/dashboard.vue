<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'StudentDashboard',
    allowedRoles: ['student'],
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  status: string
}

interface Teacher {
  id: number
  first_name: string
  last_name: string
}

interface SchoolOffice {
  id: number
  name: string
}

interface StudentSurvey {
  id: number
  title: string
  is_active: string
  survey_start?: string
  survey_end?: string
}

interface RecentActivity {
  id: number
  surveyTitle: string
  submittedAt: string
}

interface ClassInfo {
  id: number
  section: string
  course_id?: { courseCode: string; courseName: string } | null
  teacher_id?: Teacher | null
}

interface PendingEvaluation {
  survey: StudentSurvey
  classInfo?: ClassInfo
  office?: SchoolOffice
  teacher?: Teacher
  evaluationType: 'class' | 'office'
}

// State
const isLoading = ref(true)
const currentTerm = ref<AcademicTerm | null>(null)
const currentStudent = ref<any>(null)
const studentClasses = ref<ClassInfo[]>([])
const studentDepartmentId = ref<number | null>(null)
const hasPermissionError = ref(false)
const permissionErrorMessage = ref('')

const stats = ref({
  totalSurveys: null as number | null,
  pendingSurveys: null as number | null,
  completedSurveys: null as number | null,
  completionRate: null as number | null,
})

const pendingEvaluations = ref<PendingEvaluation[]>([])
const recentActivity = ref<RecentActivity[]>([])

// Fetch all dashboard data
const fetchDashboardData = async () => {
  isLoading.value = true
  try {
    await fetchCurrentStudent()
    await fetchStudentClasses()
    await Promise.all([
      fetchCurrentTerm(),
      fetchStats(),
      fetchPendingEvaluations(),
      fetchRecentActivity(),
    ])
  }
  catch (error) {
    console.error('Failed to fetch dashboard data:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch student's enrolled classes and department
const fetchStudentClasses = async () => {
  try {
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id

    if (!sid) {
      studentClasses.value = []
      studentDepartmentId.value = null
      return
    }

    // Fetch student's department
    try {
      const studentRes = await $api(`/items/students/${sid}`, {
        params: {
          fields: ['deparment_id'],
        },
      })
      const deptId = studentRes.data?.deparment_id
      studentDepartmentId.value = typeof deptId === 'object' ? deptId?.id : deptId
    }
    catch (err) {
      console.error('Failed to fetch student department:', err)
      studentDepartmentId.value = null
    }

    // Fetch classes student is enrolled in
    const res = await $api('/items/classes', {
      params: {
        filter: {
          student_id: {
            students_id: { _eq: sid },
          },
        },
        fields: ['id', 'section', 'course_id.courseCode', 'course_id.courseName', 'teacher_id.id', 'teacher_id.first_name', 'teacher_id.last_name'],
      },
    })

    studentClasses.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch student classes:', error)
    studentClasses.value = []
  }
}

// Get current student from user data
const fetchCurrentStudent = async () => {
  try {
    const userData = useCookie('userData').value as any
    if (userData?.student_id) {
      currentStudent.value = userData
    }
  }
  catch (error) {
    console.error('Failed to get student data:', error)
  }
}

// Fetch current academic term
const fetchCurrentTerm = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        filter: { status: { _eq: 'Active' } },
        limit: 1,
      },
    })
    currentTerm.value = res.data?.[0] || null
  }
  catch (error) {
    console.error('Failed to fetch current term:', error)
  }
}

// Fetch stats - only counts surveys assigned to this student
const fetchStats = async () => {
  try {
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id ? Number(userData.student_id) : null

    if (!studentId) {
      stats.value = { totalSurveys: null, pendingSurveys: null, completedSurveys: null, completionRate: null }
      return
    }

    // Get all active surveys with their class assignments and office info
    const surveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          'id',
          'evaluation_type',
          'assignment_mode',
          'classes.classes_id.id',
          'students.students_id',
          'office_id',
        ],
      },
    })

    const allSurveys = surveysRes.data
    const studentClassIds = studentClasses.value.map(c => c.id)

    // Count surveys assigned to this student
    let assignedCount = 0
    for (const survey of allSurveys) {
      const evaluationType = (survey.evaluation_type || 'Class').toLowerCase()

      if (evaluationType === 'office') {
        // Office-based survey - check assignment_mode
        const assignmentMode = survey.assignment_mode || 'all'
        if (assignmentMode === 'all') {
          // All students with enrolled classes
          if (studentClasses.value.length > 0) assignedCount++
        }
        else {
          // Check if student is in the students junction table
          const assignedStudentIds = (survey.students || []).map((s: any) => Number(s.students_id))
          if (assignedStudentIds.includes(studentId)) assignedCount++
        }
      }
      else {
        // Class-based survey - extract class IDs from junction table
        const surveyClassIds = (survey.classes || []).map((c: any) => {
          if (c.classes_id && typeof c.classes_id === 'object') {
            return c.classes_id.id
          }
          return typeof c.classes_id === 'number' ? c.classes_id : null
        }).filter((id: any) => id != null)

        // Only count if survey has classes and student is in one of them
        if (surveyClassIds.length > 0) {
          const hasMatchingClass = studentClassIds.some(scId => surveyClassIds.includes(scId))
          if (hasMatchingClass) assignedCount++
        }
      }
    }

    stats.value.totalSurveys = assignedCount

    // Get completed surveys by this student
    const completedRes = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { student_id: { _eq: studentId } },
        aggregate: { count: '*' },
      },
    })
    stats.value.completedSurveys = Number(completedRes.data?.[0]?.count)

    // Calculate pending
    if (stats.value.totalSurveys !== null && stats.value.completedSurveys !== null) {
      stats.value.pendingSurveys = Math.max(0, stats.value.totalSurveys - stats.value.completedSurveys)
    }

    // Calculate completion rate
    if (stats.value.totalSurveys !== null && stats.value.totalSurveys > 0 && stats.value.completedSurveys !== null) {
      stats.value.completionRate = Math.round((stats.value.completedSurveys / stats.value.totalSurveys) * 100)
    }
  }
  catch (error: any) {
    console.error('Failed to fetch stats:', error)
    if (error?.response?.status === 403 || error?.status === 403 || error?.data?.errors?.[0]?.extensions?.code === 'FORBIDDEN') {
      hasPermissionError.value = true
      permissionErrorMessage.value = 'You don\'t have permission to access survey data. Please contact your administrator to configure Directus permissions for the Student role.'
    }
  }
}

// Fetch pending evaluations - actual pending items for this student
const fetchPendingEvaluations = async () => {
  try {
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id ? Number(userData.student_id) : null

    if (!studentId) {
      pendingEvaluations.value = []
      return
    }

    // Fetch active surveys with class and office info
    const res = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          'id',
          'title',
          'is_active',
          'evaluation_type',
          'assignment_mode',
          'office_id.id',
          'office_id.name',
          'classes.classes_id.id',
          'students.students_id',
        ],
      },
    })

    const allSurveys = res.data

    // Get completed responses for this student
    const completedRes = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { student_id: { _eq: studentId } },
        fields: ['survey_id', 'class_id', 'office_id'],
      },
    })

    const completedEvaluations = (completedRes.data || []).map((r: any) => ({
      surveyId: typeof r.survey_id === 'object' ? r.survey_id?.id : r.survey_id,
      classId: typeof r.class_id === 'object' ? r.class_id?.id : r.class_id,
      officeId: typeof r.office_id === 'object' ? r.office_id?.id : r.office_id,
    }))

    // Build pending evaluations list
    const evaluations: PendingEvaluation[] = []
    const studentClassIds = studentClasses.value.map(c => c.id)

    for (const survey of allSurveys) {
      const evaluationType = (survey.evaluation_type || 'Class').toLowerCase() as 'class' | 'office'

      if (evaluationType === 'office') {
        // Office-based survey
        const office = typeof survey.office_id === 'object' ? survey.office_id : null
        if (!office) continue

        // Check eligibility
        const assignmentMode = survey.assignment_mode || 'all'
        let isEligible = false
        if (assignmentMode === 'all') {
          isEligible = studentClasses.value.length > 0
        }
        else {
          const assignedStudentIds = (survey.students || []).map((s: any) => Number(s.students_id))
          isEligible = assignedStudentIds.includes(studentId)
        }

        if (!isEligible) continue

        // Check if completed
        const isCompleted = completedEvaluations.some(
          c => c.surveyId === survey.id && c.officeId === office.id,
        )

        if (!isCompleted) {
          evaluations.push({
            survey,
            office,
            evaluationType: 'office',
          })
        }
      }
      else {
        // Class-based survey
        const surveyClassIds = (survey.classes || []).map((c: any) => {
          if (c.classes_id && typeof c.classes_id === 'object') {
            return c.classes_id.id
          }
          return typeof c.classes_id === 'number' ? c.classes_id : null
        }).filter((id: any) => id != null)

        // Find matching classes
        const matchingClasses = studentClasses.value.filter(sc => surveyClassIds.includes(sc.id))

        for (const classInfo of matchingClasses) {
          const isCompleted = completedEvaluations.some(
            c => c.surveyId === survey.id && c.classId === classInfo.id,
          )

          if (!isCompleted) {
            const teacher = typeof classInfo.teacher_id === 'object' ? classInfo.teacher_id : undefined
            evaluations.push({
              survey,
              classInfo,
              teacher: teacher || undefined,
              evaluationType: 'class',
            })
          }
        }
      }
    }

    pendingEvaluations.value = evaluations.slice(0, 5)
  }
  catch (error) {
    console.error('Failed to fetch pending evaluations:', error)
    pendingEvaluations.value = []
  }
}

// Fetch recent activity
const fetchRecentActivity = async () => {
  try {
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id

    if (!studentId) {
      recentActivity.value = []

      return
    }

    const res = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { student_id: { _eq: studentId } },
        fields: ['id', 'submitted_at', 'survey_id.title'],
        sort: ['-submitted_at'],
        limit: 5,
      },
    })

    recentActivity.value = (res.data).map((r: any) => ({
      id: r.id,
      surveyTitle: typeof r.survey_id === 'object' ? r.survey_id.title : `Survey #${r.survey_id}`,
      submittedAt: r.submitted_at,
    }))
  }
  catch (error) {
    console.error('Failed to fetch recent activity:', error)
    recentActivity.value = []
  }
}

// Format date
const formatDate = (dateStr: string): string => {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
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

const router = useRouter()

const goToSurveys = () => {
  router.push('/student/surveys')
}

// Helper: Get class display name
const getClassName = (classInfo?: ClassInfo): string => {
  if (!classInfo) return ''
  const courseCode = typeof classInfo.course_id === 'object' && classInfo.course_id
    ? classInfo.course_id.courseCode
    : ''
  return courseCode ? `${courseCode} - ${classInfo.section}` : classInfo.section
}

// Helper: Get teacher name
const getTeacherName = (teacher?: Teacher): string => {
  if (!teacher) return ''
  return `${teacher.first_name} ${teacher.last_name}`
}

// Navigate to evaluation
const openEvaluation = (evaluation: PendingEvaluation) => {
  if (evaluation.evaluationType === 'office' && evaluation.office) {
    router.push(`/student/surveys-${evaluation.survey.id}?office=${evaluation.office.id}`)
  }
  else if (evaluation.classInfo) {
    router.push(`/student/surveys-${evaluation.survey.id}?class=${evaluation.classInfo.id}`)
  }
}

onMounted(() => {
  fetchDashboardData()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h4 class="text-h4 mb-1">Student Dashboard</h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Welcome back! Here's your survey overview.
        </p>
      </div>
      <VChip v-if="currentTerm" color="primary" variant="tonal" size="large">
        <VIcon icon="ri-calendar-line" class="me-1" />
        {{ currentTerm.semester }} {{ currentTerm.schoolYear }}
      </VChip>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="d-flex justify-center align-center pa-12">
      <VProgressCircular indeterminate color="primary" size="48" />
    </div>

    <template v-else>
      <!-- Permission Error Alert -->
      <VAlert
        v-if="hasPermissionError"
        type="warning"
        variant="tonal"
        class="mb-6"
        closable
      >
        <template #title>Permission Required</template>
        {{ permissionErrorMessage }}
        <div class="mt-2 text-caption">
          In Directus, go to Settings > Roles & Permissions > Student role and grant read access to:
          <strong>StudentEvaluationSurvey</strong>, <strong>StudentSurveyResponses</strong>, <strong>academicTerms</strong>
        </div>
      </VAlert>

      <!-- Stats Cards -->
      <VRow class="mb-6">
        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="primary" variant="tonal" rounded>
                <VIcon icon="ri-survey-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalSurveys }}</div>
                <div class="text-caption text-medium-emphasis">Total Surveys</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="warning" variant="tonal" rounded>
                <VIcon icon="ri-time-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.pendingSurveys }}</div>
                <div class="text-caption text-medium-emphasis">Pending</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="success" variant="tonal" rounded>
                <VIcon icon="ri-check-double-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.completedSurveys }}</div>
                <div class="text-caption text-medium-emphasis">Completed</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="info" variant="tonal" rounded>
                <VIcon icon="ri-percent-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.completionRate }}%</div>
                <div class="text-caption text-medium-emphasis">Completion Rate</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow>
        <!-- Pending Evaluations -->
        <VCol cols="12" md="6">
          <VCard>
            <VCardTitle class="d-flex align-center justify-space-between pa-5">
              <div class="d-flex align-center">
                <VIcon icon="ri-time-line" class="me-2" />
                Pending Evaluations
              </div>
              <VBtn variant="text" color="primary" size="small" @click="goToSurveys">
                View All
              </VBtn>
            </VCardTitle>

            <VDivider />

            <VCardText v-if="pendingEvaluations.length === 0" class="text-center pa-8">
              <VIcon icon="ri-checkbox-circle-line" size="48" color="success" class="mb-4" />
              <p class="text-body-1 text-medium-emphasis">All caught up!</p>
              <p class="text-body-2 text-medium-emphasis">No pending evaluations</p>
            </VCardText>

            <VList v-else lines="two" class="pa-0">
              <template v-for="(evaluation, index) in pendingEvaluations" :key="`${evaluation.survey.id}-${evaluation.classInfo?.id || evaluation.office?.id}`">
                <VListItem class="cursor-pointer" @click="openEvaluation(evaluation)">
                  <template #prepend>
                    <VAvatar
                      :color="evaluation.evaluationType === 'office' ? 'info' : 'primary'"
                      variant="tonal"
                      size="36"
                    >
                      <VIcon
                        :icon="evaluation.evaluationType === 'office' ? 'ri-building-line' : 'ri-user-star-line'"
                        size="18"
                      />
                    </VAvatar>
                  </template>

                  <VListItemTitle class="font-weight-medium">
                    {{ evaluation.evaluationType === 'office' ? evaluation.office?.name : getClassName(evaluation.classInfo) }}
                  </VListItemTitle>

                  <VListItemSubtitle class="text-caption">
                    <template v-if="evaluation.evaluationType === 'office'">
                      {{ evaluation.survey.title }}
                    </template>
                    <template v-else>
                      {{ getTeacherName(evaluation.teacher) }}
                    </template>
                  </VListItemSubtitle>

                  <template #append>
                    <VBtn size="small" color="primary" variant="tonal">
                      Evaluate
                    </VBtn>
                  </template>
                </VListItem>

                <VDivider v-if="index < pendingEvaluations.length - 1" />
              </template>
            </VList>
          </VCard>
        </VCol>

        <!-- Recent Activity -->
        <VCol cols="12" md="6">
          <VCard>
            <VCardTitle class="d-flex align-center pa-5">
              <VIcon icon="ri-time-line" class="me-2" />
              Recent Activity
            </VCardTitle>

            <VDivider />

            <VCardText v-if="recentActivity.length === 0" class="text-center pa-8">
              <VIcon icon="ri-inbox-line" size="48" color="medium-emphasis" class="mb-4" />
              <p class="text-body-1 text-medium-emphasis">No recent activity</p>
            </VCardText>

            <VList v-else lines="two" class="pa-0">
              <template v-for="(activity, index) in recentActivity" :key="activity.id">
                <VListItem>
                  <template #prepend>
                    <VAvatar color="success" variant="tonal" size="36">
                      <VIcon icon="ri-check-line" size="18" />
                    </VAvatar>
                  </template>

                  <VListItemTitle class="text-body-2">
                    <span class="font-weight-medium">{{ activity.surveyTitle }}</span>
                  </VListItemTitle>

                  <VListItemSubtitle class="text-caption">
                    Completed survey
                  </VListItemSubtitle>

                  <template #append>
                    <span class="text-caption text-medium-emphasis">
                      {{ formatDate(activity.submittedAt) }}
                    </span>
                  </template>
                </VListItem>

                <VDivider v-if="index < recentActivity.length - 1" />
              </template>
            </VList>
          </VCard>
        </VCol>
      </VRow>
    </template>
  </div>
</template>
