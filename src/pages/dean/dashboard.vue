<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'DeanDashboard',
    allowedRoles: ['dean'],
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
  position?: string
}

interface DeanSurvey {
  id: number
  title: string
  is_active: string
  survey_start?: string
  survey_end?: string
}

interface RecentActivity {
  id: number
  surveyTitle: string
  teacherName?: string
  submittedAt: string
}

interface PendingEvaluation {
  survey: DeanSurvey
  teacher: Teacher
}

// State
const isLoading = ref(true)
const currentTerm = ref<AcademicTerm | null>(null)
const currentDean = ref<any>(null)
const deanDepartmentId = ref<number | null>(null)
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
    await fetchCurrentDean()
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

// Get current dean from user data and fetch their department
const fetchCurrentDean = async () => {
  try {
    const userData = useCookie('userData').value as any
    if (userData?.dean_id) {
      currentDean.value = userData

      // Fetch dean's department from Teachers table
      try {
        const deanRes = await $api(`/items/Teachers/${userData.dean_id}`, {
          params: {
            fields: ['id', 'Department.Department_id'],
          },
        })
        // Department is M2M junction, get the first department
        const departments = deanRes.data?.Department || []
        if (departments.length > 0) {
          const deptId = departments[0].Department_id
          deanDepartmentId.value = typeof deptId === 'object' ? deptId?.id : deptId
        }
      }
      catch (err) {
        console.error('Failed to fetch dean department:', err)
        deanDepartmentId.value = null
      }
    }
  }
  catch (error) {
    console.error('Failed to get dean data:', error)
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

// Fetch stats - only counts surveys with teachers in dean's department
const fetchStats = async () => {
  try {
    const userData = useCookie('userData').value as any
    const deanId = userData?.dean_id

    if (!deanId) {
      stats.value = { totalSurveys: null, pendingSurveys: null, completedSurveys: null, completionRate: null }
      return
    }

    // Get all active surveys with teachers_to_evaluate and their departments
    const surveysRes = await $api('/items/DeanEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          'id',
          'teachers_to_evaluate.Teachers_id.id',
          'teachers_to_evaluate.Teachers_id.Department.Department_id',
        ],
      },
    })

    const allSurveys = surveysRes.data

    // Count only teachers in dean's department
    let totalExpected = 0

    // If dean has no department set, don't count any surveys
    if (deanDepartmentId.value !== null) {
      for (const survey of allSurveys) {
        const teachers = survey.teachers_to_evaluate || []
        for (const assignment of teachers) {
          const teacher = assignment.Teachers_id
          if (!teacher) continue

          // Check if teacher belongs to dean's department
          const teacherDepts = teacher.Department || []
          if (teacherDepts.length === 0) continue

          const isInDeanDept = teacherDepts.some((d: any) => {
            const deptId = typeof d.Department_id === 'object' ? d.Department_id?.id : d.Department_id
            return deptId === deanDepartmentId.value
          })

          if (isInDeanDept) {
            totalExpected++
          }
        }
      }
    }

    stats.value.totalSurveys = totalExpected

    // Get completed evaluations by this dean
    try {
      const completedRes = await $api('/items/DeanSurveyResponses', {
        params: {
          filter: { dean_id: { _eq: deanId } },
          aggregate: { count: '*' },
        },
      })
      stats.value.completedSurveys = Number(completedRes.data?.[0]?.count)
    }
    catch (responseError: any) {
      console.error('Failed to fetch completed responses count:', responseError)
    }

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
      permissionErrorMessage.value = 'You don\'t have permission to access evaluation data. Please contact your administrator to configure Directus permissions for the Dean role.'
    }
  }
}

// Fetch pending evaluations - actual pending items for this dean
const fetchPendingEvaluations = async () => {
  try {
    const userData = useCookie('userData').value as any
    const deanId = userData?.dean_id

    if (!deanId || deanDepartmentId.value === null) {
      pendingEvaluations.value = []
      return
    }

    // Fetch active surveys with teachers and their departments
    const res = await $api('/items/DeanEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          'id',
          'title',
          'is_active',
          'teachers_to_evaluate.Teachers_id.id',
          'teachers_to_evaluate.Teachers_id.first_name',
          'teachers_to_evaluate.Teachers_id.last_name',
          'teachers_to_evaluate.Teachers_id.position',
          'teachers_to_evaluate.Teachers_id.Department.Department_id',
        ],
      },
    })

    const allSurveys = res.data

    // Get completed evaluations by this dean
    const completedRes = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: { dean_id: { _eq: deanId } },
        fields: ['survey_id', 'evaluated_teached_id'],
      },
    })

    const completedEvaluations = (completedRes.data || []).map((r: any) => ({
      surveyId: typeof r.survey_id === 'object' ? r.survey_id?.id : r.survey_id,
      teacherId: typeof r.evaluated_teached_id === 'object' ? r.evaluated_teached_id?.id : r.evaluated_teached_id,
    }))

    // Build pending evaluations list
    const evaluations: PendingEvaluation[] = []

    for (const survey of allSurveys) {
      const teachers = survey.teachers_to_evaluate || []

      for (const assignment of teachers) {
        const teacher = assignment.Teachers_id
        if (!teacher) continue

        // Check if teacher belongs to dean's department
        const teacherDepts = teacher.Department || []
        if (teacherDepts.length === 0) continue

        const isInDeanDept = teacherDepts.some((d: any) => {
          const deptId = typeof d.Department_id === 'object' ? d.Department_id?.id : d.Department_id
          return deptId === deanDepartmentId.value
        })

        if (!isInDeanDept) continue

        // Check if already completed
        const isCompleted = completedEvaluations.some(
          c => c.surveyId === survey.id && c.teacherId === teacher.id,
        )

        if (!isCompleted) {
          evaluations.push({
            survey,
            teacher: teacher as Teacher,
          })
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
    const deanId = userData?.dean_id

    if (!deanId) {
      recentActivity.value = []

      return
    }

    const res = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: { dean_id: { _eq: deanId } },
        fields: ['*', 'survey_id.*', 'evaluated_teached_id.*'],
        sort: ['-submitted_at'],
        limit: 5,
      },
    })

    recentActivity.value = (res.data || []).map((r: any) => ({
      id: r.id,
      surveyTitle: typeof r.survey_id === 'object' ? r.survey_id.title : `Survey #${r.survey_id}`,
      teacherName: r.evaluated_teached_id && typeof r.evaluated_teached_id === 'object'
        ? `${r.evaluated_teached_id.first_name} ${r.evaluated_teached_id.last_name}`
        : undefined,
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
  router.push('/dean/surveys')
}

// Helper: Get teacher full name
const getTeacherName = (teacher: Teacher): string => {
  return `${teacher.first_name} ${teacher.last_name}`
}

// Navigate to evaluation
const openEvaluation = (evaluation: PendingEvaluation) => {
  router.push(`/dean/surveys-${evaluation.survey.id}?teacher=${evaluation.teacher.id}`)
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
        <h4 class="text-h4 mb-1">Dean Dashboard</h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Welcome back! Here's your evaluation overview.
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
          In Directus, go to Settings > Roles & Permissions > Dean role and grant read access to:
          <strong>DeanEvaluationSurvey</strong>, <strong>DeanSurveyResponses</strong>, <strong>academicTerms</strong>
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
              <template v-for="(evaluation, index) in pendingEvaluations" :key="`${evaluation.survey.id}-${evaluation.teacher.id}`">
                <VListItem class="cursor-pointer" @click="openEvaluation(evaluation)">
                  <template #prepend>
                    <VAvatar
                      color="primary"
                      variant="tonal"
                      size="36"
                    >
                      <VIcon
                        icon="ri-user-star-line"
                        size="18"
                      />
                    </VAvatar>
                  </template>

                  <VListItemTitle class="font-weight-medium">
                    {{ getTeacherName(evaluation.teacher) }}
                  </VListItemTitle>

                  <VListItemSubtitle class="text-caption">
                    {{ evaluation.survey.title }}
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
                    <template v-if="activity.teacherName">
                      Evaluated {{ activity.teacherName }}
                    </template>
                    <template v-else>
                      Completed evaluation
                    </template>
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
