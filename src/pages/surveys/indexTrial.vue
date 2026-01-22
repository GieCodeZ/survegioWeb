<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
    allowedRoles: ['administrator'],
  },
})

const router = useRouter()

// ==================== INTERFACES ====================

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
}

interface DeanQuestion {
  id?: number
  question: string
  sort?: number
}

interface DeanQuestionGroup {
  id?: number
  number: number
  title: string
  response_style: string
  questions?: DeanQuestion[]
}

interface DeanSurvey {
  id?: number
  title: string
  instruction: string
  survey_type: 'faculty_evaluation' | 'program_assessment'
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: AcademicTerm | number | null
  question_groups?: DeanQuestionGroup[]
  _responseCount?: number
  _totalExpected?: number
}

interface DeanSurveyForm {
  id?: number
  title: string
  instruction: string
  survey_type: 'faculty_evaluation' | 'program_assessment'
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: number | null
}

// ==================== STATE ====================

const academicTerms = ref<AcademicTerm[]>([])
const isLoading = ref(false)
const deanSurveys = ref<DeanSurvey[]>([])
const isDeleteDialogOpen = ref(false)
const isCreateDialogOpen = ref(false)
const isSaving = ref(false)
const selectedSurvey = ref<DeanSurvey | null>(null)
const search = ref('')
const statusFilter = ref<string | null>(null)
const typeFilter = ref<string | null>(null)

const form = ref<DeanSurveyForm>({
  title: '',
  instruction: '',
  survey_type: 'faculty_evaluation',
  survey_start: '',
  survey_end: '',
  is_active: 'Draft',
  academic_term_id: null,
})

// ==================== OPTIONS ====================

const statusOptions = [
  { title: 'Draft', value: 'Draft' },
  { title: 'Active', value: 'Active' },
  { title: 'Archived', value: 'Archived' },
]

const surveyTypeOptions = [
  { title: 'Faculty Evaluation', value: 'faculty_evaluation' },
  { title: 'Program Assessment', value: 'program_assessment' },
]

// ==================== COMPUTED ====================

const filteredSurveys = computed(() => {
  let result = deanSurveys.value

  if (statusFilter.value)
    result = result.filter((s: DeanSurvey) => s.is_active === statusFilter.value)

  if (typeFilter.value)
    result = result.filter((s: DeanSurvey) => s.survey_type === typeFilter.value)

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter((s: DeanSurvey) =>
      s.title.toLowerCase().includes(searchLower),
    )
  }

  return result
})

// ==================== TABLE HEADERS ====================

const headers = [
  { title: 'Title', key: 'title', sortable: true },
  { title: 'Type', key: 'survey_type', sortable: true },
  { title: 'Academic Term', key: 'acadTerm', sortable: false },
  { title: 'Status', key: 'is_active', sortable: true },
  { title: 'Questions', key: 'questions', sortable: false, align: 'center' as const },
  { title: 'Progress', key: 'progress', sortable: false, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// ==================== HELPERS ====================

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active': return 'success'
    case 'Draft': return 'warning'
    case 'Archived': return 'secondary'
    default: return 'default'
  }
}

const getSurveyTypeColor = (type: string) => {
  return type === 'faculty_evaluation' ? 'info' : 'warning'
}

const getSurveyTypeLabel = (type: string) => {
  return type === 'faculty_evaluation' ? 'Faculty' : 'Program'
}

const getAcademicTermDisplay = (survey: DeanSurvey): string => {
  if (!survey.academic_term_id) return '-'
  if (typeof survey.academic_term_id === 'object' && survey.academic_term_id !== null) {
    const term = survey.academic_term_id
    if (term.semester && term.schoolYear)
      return `${term.schoolYear} - ${term.semester}`
    return `Term #${term.id}`
  }
  const term = academicTerms.value.find((t: AcademicTerm) => t.id === survey.academic_term_id)
  if (term)
    return `${term.schoolYear} - ${term.semester}`
  return '-'
}

const getQuestionsCount = (survey: DeanSurvey): number => {
  if (!survey.question_groups || !Array.isArray(survey.question_groups)) return 0
  return survey.question_groups.reduce((total, group) => {
    if (group.questions && Array.isArray(group.questions))
      return total + group.questions.length
    return total
  }, 0)
}

const getProgress = (survey: DeanSurvey): number => {
  const total = survey._totalExpected ?? 0
  const responseCount = survey._responseCount ?? 0

  if (total === 0) return 0
  return Math.round((responseCount / total) * 100)
}

// ==================== FETCH FUNCTIONS ====================

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

const fetchSurveys = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/DeanEvaluationSurvey', {
      params: {
        fields: [
          '*',
          'academic_term_id.*',
          'question_groups.*',
          'question_groups.questions.*',
        ],
        sort: ['-id'],
      },
    })

    const surveys: DeanSurvey[] = res.data || []

    // Fetch response counts and calculate expected totals
    for (const survey of surveys) {
      if (survey.id) {
        try {
          const responseRes = await $api('/items/DeanSurveyResponses', {
            params: {
              filter: { survey_id: { _eq: survey.id } },
              aggregate: { count: '*' },
            },
          })
          survey._responseCount = responseRes.data?.[0]?.count ?? 0
        }
        catch {
          survey._responseCount = 0
        }

        // Calculate expected responses based on survey type
        if (survey.survey_type === 'faculty_evaluation') {
          // For faculty evaluation: count deans * teachers in their departments
          try {
            const deansRes = await $api('/items/Teachers', {
              params: {
                filter: { position: { _eq: 'Dean' }, is_active: { _eq: 'Active' } },
                aggregate: { count: '*' },
              },
            })
            const teachersRes = await $api('/items/Teachers', {
              params: {
                filter: { position: { _eq: 'Professor' }, is_active: { _eq: 'Active' } },
                aggregate: { count: '*' },
              },
            })
            const deanCount = deansRes.data?.[0]?.count ?? 0
            const teacherCount = teachersRes.data?.[0]?.count ?? 0
            survey._totalExpected = deanCount * teacherCount
          }
          catch {
            survey._totalExpected = 0
          }
        }
        else {
          // For program assessment: count active deans
          try {
            const deansRes = await $api('/items/Teachers', {
              params: {
                filter: { position: { _eq: 'Dean' }, is_active: { _eq: 'Active' } },
                aggregate: { count: '*' },
              },
            })
            survey._totalExpected = deansRes.data?.[0]?.count ?? 0
          }
          catch {
            survey._totalExpected = 0
          }
        }
      }
    }

    deanSurveys.value = surveys
  }
  catch (error) {
    console.error('Failed to fetch dean surveys:', error)
    deanSurveys.value = []
  }
  finally {
    isLoading.value = false
  }
}

// ==================== ACTIONS ====================

const openCreateDialog = () => {
  form.value = {
    title: '',
    instruction: '',
    survey_type: 'faculty_evaluation',
    survey_start: '',
    survey_end: '',
    is_active: 'Draft',
    academic_term_id: null,
  }
  isCreateDialogOpen.value = true
}

const saveSurvey = async () => {
  if (!form.value.title.trim()) return

  isSaving.value = true
  try {
    await $api('/items/DeanEvaluationSurvey', {
      method: 'POST',
      body: {
        title: form.value.title,
        instruction: form.value.instruction,
        survey_type: form.value.survey_type,
        survey_start: form.value.survey_start || null,
        survey_end: form.value.survey_end || null,
        is_active: form.value.is_active,
        academic_term_id: form.value.academic_term_id,
      },
    })

    isCreateDialogOpen.value = false
    await fetchSurveys()
  }
  catch (error) {
    console.error('Failed to create dean survey:', error)
  }
  finally {
    isSaving.value = false
  }
}

const goToSurvey = (survey: DeanSurvey) => {
  if (survey.id) {
    router.push(`/surveys/dean-evaluation/${survey.id}`)
  }
}

const handleRowClick = (_event: Event, row: { item: DeanSurvey }) => {
  goToSurvey(row.item)
}

const openDeleteDialog = (survey: DeanSurvey) => {
  selectedSurvey.value = survey
  isDeleteDialogOpen.value = true
}

const deleteSurvey = async () => {
  if (!selectedSurvey.value?.id) return

  try {
    // First, delete all responses associated with this survey
    const responsesRes = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: { survey_id: { _eq: selectedSurvey.value.id } },
        fields: ['id'],
      },
    })

    if (responsesRes.data?.length > 0) {
      // Delete each response
      await Promise.all(
        responsesRes.data.map((response: { id: number }) =>
          $api(`/items/DeanSurveyResponses/${response.id}`, { method: 'DELETE' }),
        ),
      )
    }

    // Then delete the survey
    await $api(`/items/DeanEvaluationSurvey/${selectedSurvey.value.id}`, {
      method: 'DELETE',
    })
    isDeleteDialogOpen.value = false
    selectedSurvey.value = null
    await fetchSurveys()
  }
  catch (error) {
    console.error('Failed to delete dean survey:', error)
  }
}

// ==================== LIFECYCLE ====================

onMounted(() => {
  fetchSurveys()
  fetchAcademicTerms()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="pa-6">
        <div class="d-flex align-center">
          <VIcon icon="ri-user-settings-line" size="28" class="me-3" />
          <span class="text-h5">Dean Evaluation</span>
        </div>
      </VCardTitle>

      <VDivider />

      <div class="d-flex align-center pa-4 gap-4">
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search evaluations..."
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 300px;"
        />
        <VSelect
          v-model="typeFilter"
          :items="surveyTypeOptions"
          item-title="title"
          item-value="value"
          label="Type"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          style="max-width: 180px;"
        />
        <VSelect
          v-model="statusFilter"
          :items="statusOptions"
          item-title="title"
          item-value="value"
          label="Status"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          style="max-width: 150px;"
        />
        <VSpacer />
        <VBtn color="primary" prepend-icon="ri-add-line" @click="openCreateDialog">
          Create Evaluation
        </VBtn>
      </div>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="filteredSurveys"
        :loading="isLoading"
        hover
        class="clickable-rows"
        @click:row="handleRowClick"
      >
        <template #[`item.title`]="{ item }">
          <a
            class="font-weight-medium text-primary cursor-pointer text-decoration-none"
            @click="goToSurvey(item)"
          >
            {{ item.title }}
          </a>
        </template>

        <template #[`item.survey_type`]="{ item }">
          <VChip :color="getSurveyTypeColor(item.survey_type)" size="small" variant="tonal">
            {{ getSurveyTypeLabel(item.survey_type) }}
          </VChip>
        </template>

        <template #[`item.acadTerm`]="{ item }">
          <VChip size="small" variant="tonal" color="secondary">
            {{ getAcademicTermDisplay(item) }}
          </VChip>
        </template>

        <template #[`item.is_active`]="{ item }">
          <VChip :color="getStatusColor(item.is_active)" size="small" variant="tonal">
            {{ item.is_active }}
          </VChip>
        </template>

        <template #[`item.questions`]="{ item }">
          <VChip size="small" variant="tonal" color="info">
            {{ getQuestionsCount(item) }}
          </VChip>
        </template>

        <template #[`item.progress`]="{ item }">
          <div class="d-flex align-center gap-2" style="min-width: 140px;">
            <VProgressLinear
              :model-value="getProgress(item)"
              :color="getProgress(item) >= 75 ? 'success' : getProgress(item) >= 50 ? 'warning' : 'primary'"
              height="8"
              rounded
              style="min-width: 60px;"
            />
            <div class="text-caption text-no-wrap">
              {{ getProgress(item) }}%
              <span class="text-medium-emphasis">({{ item._responseCount || 0 }}/{{ item._totalExpected || 0 }})</span>
            </div>
          </div>
        </template>

        <template #[`item.actions`]="{ item }">
          <div class="d-flex justify-center gap-1">
            <IconBtn size="small" @click.stop="goToSurvey(item)">
              <VIcon icon="ri-pencil-line" />
            </IconBtn>
            <IconBtn size="small" color="error" @click.stop="openDeleteDialog(item)">
              <VIcon icon="ri-delete-bin-line" />
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center pa-8">
            <VIcon icon="ri-user-settings-line" size="64" color="medium-emphasis" class="mb-4" />
            <p class="text-h6 text-medium-emphasis mb-2">No Dean Evaluations</p>
            <p class="text-body-2 text-medium-emphasis mb-4">Create your first evaluation to start collecting feedback</p>
            <VBtn color="primary" prepend-icon="ri-add-line" @click="openCreateDialog">
              Create Evaluation
            </VBtn>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Delete Survey Dialog -->
    <VDialog v-model="isDeleteDialogOpen" max-width="450">
      <VCard>
        <VCardTitle class="pa-6">Delete Evaluation</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          <p class="mb-4">
            Are you sure you want to delete <strong>{{ selectedSurvey?.title }}</strong>?
          </p>
          <VAlert
            type="warning"
            variant="tonal"
            class="mb-0"
          >
            <strong>Warning:</strong> All responses and data associated with this evaluation will be permanently deleted. This action cannot be undone.
          </VAlert>
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDeleteDialogOpen = false">Cancel</VBtn>
          <VBtn color="error" @click="deleteSurvey">Delete</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Create Survey Dialog -->
    <VDialog v-model="isCreateDialogOpen" max-width="700" persistent>
      <VCard>
        <VCardTitle class="pa-6">
          Create New Dean Evaluation
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="8">
              <VTextField
                v-model="form.title"
                label="Evaluation Title"
                placeholder="Enter evaluation title"
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

            <VCol cols="12" md="6">
              <VSelect
                v-model="form.survey_type"
                :items="surveyTypeOptions"
                item-title="title"
                item-value="value"
                label="Evaluation Type"
                variant="outlined"
              />
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

            <VCol cols="12">
              <VTextarea
                v-model="form.instruction"
                label="Instructions"
                placeholder="Enter instructions for deans"
                variant="outlined"
                rows="2"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="form.survey_start"
                label="Start Date"
                type="date"
                variant="outlined"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="form.survey_end"
                label="End Date"
                type="date"
                variant="outlined"
              />
            </VCol>
          </VRow>

          <!-- Survey Type Info -->
          <VAlert
            v-if="form.survey_type"
            :color="form.survey_type === 'faculty_evaluation' ? 'info' : 'warning'"
            variant="tonal"
            class="mt-4"
          >
            <template #title>
              {{ form.survey_type === 'faculty_evaluation' ? 'Faculty Evaluation' : 'Program Assessment' }}
            </template>
            <template v-if="form.survey_type === 'faculty_evaluation'">
              Deans will evaluate each faculty member (professor) in their department individually.
            </template>
            <template v-else>
              Deans will evaluate programs such as departmental budget proposals and other program-related assessments.
            </template>
          </VAlert>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isCreateDialogOpen = false">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            :disabled="!form.title.trim()"
            @click="saveSurvey"
          >
            Create
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
</style>
