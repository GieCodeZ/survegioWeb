<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'DeanSurveys',
    allowedRoles: ['dean'],
  },
})

// ==================== INTERFACES ====================

interface DeanQuestion {
  id: number
  question: string
  sort?: number
}

interface DeanQuestionGroup {
  id: number
  number: number
  title: string
  response_style: string
  questions?: DeanQuestion[]
}

interface DeanSurvey {
  id: number
  title: string
  instruction?: string
  is_active: string
  survey_start?: string
  survey_end?: string
  evaluation_type?: 'class' | 'office' | null
  question_groups?: DeanQuestionGroup[]
  teachers_to_evaluate?: { Teachers_id: Teacher | number }[]
}

interface Teacher {
  id: number
  first_name: string
  last_name: string
  position?: string
  Department?: any[]
}

interface CompletedResponse {
  id: number
  survey_id: number
  surveyTitle: string
  teacherId?: number
  teacherName?: string
  submitted_at: string
}

interface PendingEvaluation {
  survey: DeanSurvey
  teacher?: Teacher
  isCompleted: boolean
}

// ==================== STATE ====================

const isLoading = ref(true)
const activeTab = ref('pending')
const pendingEvaluations = ref<PendingEvaluation[]>([])
const completedResponses = ref<CompletedResponse[]>([])
const deanDepartmentId = ref<number | null>(null)
const hasPermissionError = ref(false)

// ==================== COMPUTED ====================

const pendingCount = computed(() => pendingEvaluations.value.filter((e: PendingEvaluation) => !e.isCompleted).length)
const completedCount = computed(() => completedResponses.value.length)



// ==================== FETCH FUNCTIONS ====================

const fetchData = async () => {
  isLoading.value = true
  hasPermissionError.value = false
  try {
    // First fetch dean's department
    await fetchDeanDepartment()
    // Then fetch pending evaluations and completed responses in parallel
    await Promise.all([
      fetchPendingEvaluations(),
      fetchCompletedResponses(),
    ])
  }
  catch (error: any) {
    console.error('Failed to fetch data:', error)
    if (error?.data?.errors?.[0]?.extensions?.code === 'FORBIDDEN') {
      hasPermissionError.value = true
    }
  }
  finally {
    isLoading.value = false
  }
}

// Fetch dean's department
const fetchDeanDepartment = async () => {
  try {
    const userData = useCookie('userData').value as any
    const deanId = userData?.dean_id

    if (!deanId) {
      deanDepartmentId.value = null
      return
    }

    const deanRes = await $api(`/items/Teachers/${deanId}`, {
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
  catch (error) {
    console.error('Failed to fetch dean department:', error)
    deanDepartmentId.value = null
  }
}

// Fetch pending evaluations using teachers_to_evaluate from surveys
const fetchPendingEvaluations = async () => {
  try {
    const userData = useCookie('userData').value as any
    const deanId = userData?.dean_id

    if (!deanId) {
      console.warn('No dean_id found in userData')
      pendingEvaluations.value = []
      return
    }

    // Fetch active surveys with teachers and their departments
    const res = await $api('/items/DeanEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          '*',
          'teachers_to_evaluate.Teachers_id.id',
          'teachers_to_evaluate.Teachers_id.first_name',
          'teachers_to_evaluate.Teachers_id.last_name',
          'teachers_to_evaluate.Teachers_id.position',
          'teachers_to_evaluate.Teachers_id.Department.Department_id',
          'question_groups.*',
          'question_groups.questions.*',
        ],
      },
    })

    const allSurveys: DeanSurvey[] = res.data || []

    // Get completed responses for this dean (survey_id + evaluated_teached_id combinations)
    interface CompletedEvaluation {
      surveyId: number
      teacherId: number | null
    }
    let completedEvaluations: CompletedEvaluation[] = []
    try {
      const completedRes = await $api('/items/DeanSurveyResponses', {
        params: {
          filter: { dean_id: { _eq: deanId } },
          fields: ['survey_id', 'evaluated_teached_id'],
        },
      })
      completedEvaluations = (completedRes.data || []).map((r: any) => ({
        surveyId: typeof r.survey_id === 'object' ? r.survey_id?.id : r.survey_id,
        teacherId: typeof r.evaluated_teached_id === 'object' ? r.evaluated_teached_id?.id : r.evaluated_teached_id,
      }))
    }
    catch (err) {
      console.error('Failed to fetch completed responses:', err)
    }

    // Build pending evaluations - only teachers in dean's department
    const evaluations: PendingEvaluation[] = []

    // If dean has no department set, don't show any evaluations
    if (deanDepartmentId.value !== null) {
      for (const survey of allSurveys) {
        const teachersToEvaluate = survey.teachers_to_evaluate || []

        if (teachersToEvaluate.length > 0) {
          // Survey has specific teachers to evaluate
          for (const assignment of teachersToEvaluate) {
            const teacher = typeof assignment.Teachers_id === 'object'
              ? assignment.Teachers_id
              : null

            if (!teacher) continue

            // Check if teacher belongs to dean's department
            const teacherDepts = (teacher as any).Department || []
            if (teacherDepts.length === 0) continue

            const isInDeanDept = teacherDepts.some((d: any) => {
              const deptId = typeof d.Department_id === 'object' ? d.Department_id?.id : d.Department_id
              return deptId === deanDepartmentId.value
            })

            // Skip teachers not in dean's department
            if (!isInDeanDept) continue

            const isCompleted = completedEvaluations.some(
              c => c.surveyId === survey.id && c.teacherId === teacher.id,
            )

            if (!isCompleted) {
              evaluations.push({
                survey,
                teacher: teacher as Teacher,
                isCompleted: false,
              })
            }
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
    const deanId = userData?.dean_id

    if (!deanId) {
      completedResponses.value = []
      return
    }

    const res = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: { dean_id: { _eq: deanId } },
        fields: ['id', 'survey_id.id', 'survey_id.title', 'evaluated_teached_id.id', 'evaluated_teached_id.first_name', 'evaluated_teached_id.last_name', 'submitted_at'],
        sort: ['-submitted_at'],
      },
    })

    completedResponses.value = (res.data || []).map((r: any) => {
      const teacher = r.evaluated_teached_id
      return {
        id: r.id,
        survey_id: typeof r.survey_id === 'object' ? r.survey_id.id : r.survey_id,
        surveyTitle: typeof r.survey_id === 'object' ? r.survey_id.title : `Survey #${r.survey_id}`,
        teacherId: teacher && typeof teacher === 'object' ? teacher.id : teacher,
        teacherName: teacher && typeof teacher === 'object' ? `${teacher.first_name} ${teacher.last_name}` : undefined,
        submitted_at: r.submitted_at,
      }
    })
  }
  catch (error) {
    console.error('Failed to fetch completed responses:', error)
    completedResponses.value = []
  }
}

// Navigate to survey page
const router = useRouter()

const openSurvey = (evaluation: PendingEvaluation) => {
  // Include teacher ID in query params for faculty evaluations
  if (evaluation.teacher) {
    router.push(`/dean/surveys-${evaluation.survey.id}?teacher=${evaluation.teacher.id}`)
  }
  else {
    router.push(`/dean/surveys-${evaluation.survey.id}`)
  }
}

// Get teacher full name
const getTeacherName = (teacher?: Teacher): string => {
  if (!teacher) return '-'
  return `${teacher.first_name} ${teacher.last_name}`
}

// ==================== HELPERS ====================

const formatDate = (dateStr: string): string => {
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
          Complete your pending evaluations and view your submission history
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

    <!-- Permission Error Alert -->
    <VAlert
      v-if="hasPermissionError"
      type="warning"
      variant="tonal"
      class="mb-6"
      closable
    >
      <template #title>Permission Required</template>
      You don't have permission to access evaluation data. Please contact your administrator to configure Directus permissions for the Dean role.
    </VAlert>

    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading evaluations...</span>
      </VCardText>
    </VCard>

    <template v-else>
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
                    <th>Title</th>
                    <th>Faculty Member</th>
                    <th>Questions</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(evaluation, index) in pendingEvaluations.filter(e => !e.isCompleted)" :key="`${evaluation.survey.id}-${evaluation.teacher?.id || index}`">
                    <td>{{ evaluation.survey.title }}</td>
                    <td>{{ getTeacherName(evaluation.teacher) }}</td>
                    <td>{{ evaluation.survey.question_groups?.reduce((acc, g) => acc + (g.questions?.length || 0), 0) || 0 }}</td>
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

            <VDataTable
              v-else
              :headers="[
                { title: 'Survey', key: 'surveyTitle', sortable: true },
                { title: 'Teacher Evaluated', key: 'teacherName', sortable: true },
                { title: 'Submitted', key: 'submitted_at', sortable: true },
              ]"
              :items="completedResponses"
              :items-per-page="10"
              hover
            >
              <template #[`item.surveyTitle`]="{ item }">
                <div class="d-flex align-center gap-2">
                  <VAvatar size="32" color="success" variant="tonal">
                    <VIcon icon="ri-check-line" size="16" />
                  </VAvatar>
                  <span class="font-weight-medium">{{ item.surveyTitle }}</span>
                </div>
              </template>

              <template #[`item.teacherName`]="{ item }">
                {{ item.teacherName || '-' }}
              </template>

              <template #[`item.submitted_at`]="{ item }">
                {{ formatDate(item.submitted_at) }}
              </template>
            </VDataTable>
          </VWindowItem>
        </VWindow>
      </VCard>
    </template>
  </div>
</template>

<style scoped>
.v-btn-toggle {
  flex-wrap: wrap;
}

.v-btn-toggle .v-btn {
  min-width: auto;
}
</style>
