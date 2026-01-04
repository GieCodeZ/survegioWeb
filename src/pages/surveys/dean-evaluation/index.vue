<script setup lang="ts">
import { $api } from '@/utils/api'
import { SURVEY_STATUS_OPTIONS } from '@/utils/constants'

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

// Date picker menu state
const startDateMenu = ref(false)
const endDateMenu = ref(false)

const form = ref<DeanSurveyForm>({
  title: '',
  instruction: '',
  survey_start: '',
  survey_end: '',
  is_active: '' as 'Active' | 'Draft' | 'Archived',
  academic_term_id: null,
})

// ==================== OPTIONS ====================

const statusOptions = SURVEY_STATUS_OPTIONS

// ==================== COMPUTED ====================

const filteredSurveys = computed(() => {
  let result = deanSurveys.value

  if (statusFilter.value)
    result = result.filter((s: DeanSurvey) => s.is_active === statusFilter.value)

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
    default: return ''
  }
}

const getAcademicTermDisplay = (survey: DeanSurvey): string => {
  if (!survey.academic_term_id) return ''
  if (typeof survey.academic_term_id === 'object' && survey.academic_term_id !== null) {
    const term = survey.academic_term_id
    if (term.semester && term.schoolYear)
      return `${term.schoolYear} - ${term.semester}`
    return `Term #${term.id}`
  }
  const term = academicTerms.value.find((t: AcademicTerm) => t.id === survey.academic_term_id)
  if (term)
    return `${term.schoolYear} - ${term.semester}`
  return ''
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
  const total = survey._totalExpected
  const responseCount = survey._responseCount

  if (total === 0) return 0
  return Math.round((responseCount / total) * 100)
}

// Date picker helpers
const formatDateDisplay = (dateString: string): string => {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const startDateValue = computed({
  get: () => form.value.survey_start ? new Date(form.value.survey_start) : null,
  set: (val: Date | null) => {
    if (val) {
      // Preserve existing time or default to start of day
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
      // Preserve existing time or default to end of day
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
    if (!form.value.survey_start) return ''
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
    if (!form.value.survey_end) return ''
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

// ==================== FETCH FUNCTIONS ====================

const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        filter: { status: { _eq: 'Active' } },
        sort: '-schoolYear',
      },
    })
    academicTerms.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

const fetchSurveys = async () => {
  isLoading.value = true
  try {
    // Get active deans count once for all surveys
    let activeDeanCount = 0
    try {
      const deansRes = await $api('/items/Teachers', {
        params: {
          filter: { position: { _eq: 'Dean' }, is_active: { _eq: 'Active' } },
          aggregate: { count: '*' },
        },
      })
      activeDeanCount = Number(deansRes.data?.[0]?.count)
    }
    catch {
      // Failed to get dean count
    }

    const res = await $api('/items/DeanEvaluationSurvey', {
      params: {
        fields: [
          '*',
          'academic_term_id.*',
          'question_groups.*',
          'question_groups.questions.*',
          'teachers_to_evaluate.Teachers_id',
        ],
        sort: ['-id'],
      },
    })

    const surveys: DeanSurvey[] = res.data

    for (const survey of surveys) {
      if (survey.id) {
        // Get response count for this survey
        try {
          const responseRes = await $api('/items/DeanSurveyResponses', {
            params: {
              filter: { survey_id: { _eq: survey.id } },
              aggregate: { count: '*' },
            },
          })
          survey._responseCount = Number(responseRes.data?.[0]?.count)
        }
        catch {
          // Failed to get response count
        }

        // Calculate expected responses: deans × teachers_to_evaluate
        const teachersCount = (survey as any).teachers_to_evaluate?.length
        survey._totalExpected = activeDeanCount * teachersCount
      }
    }

    deanSurveys.value = surveys
  }
  catch (error) {
    console.error('Failed to fetch dean surveys:', error)
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
    survey_start: '',
    survey_end: '',
    is_active: '' as 'Active' | 'Draft' | 'Archived',
    academic_term_id: null,
  }
  isCreateDialogOpen.value = true
}

const saveSurvey = async () => {
  if (!form.value.title.trim()) return

  isSaving.value = true
  try {
    const response = await $api('/items/DeanEvaluationSurvey', {
      method: 'POST',
      body: {
        title: form.value.title,
        instruction: form.value.instruction,
        survey_start: form.value.survey_start || null,
        survey_end: form.value.survey_end || null,
        is_active: form.value.is_active,
        academic_term_id: form.value.academic_term_id,
      },
    })

    isCreateDialogOpen.value = false

    // Navigate to the detail page to add questions
    const createdSurveyId = response.data?.id
    if (createdSurveyId) {
      router.push(`/surveys/dean-evaluation/${createdSurveyId}`)
    }
    else {
      await fetchSurveys()
    }
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
          <span class="text-h5">Dean Evaluation Survey</span>
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

        <template #[`item.acadTerm`]="{ item }">
          <span class="text-body-2">{{ getAcademicTermDisplay(item) }}</span>
        </template>

        <template #[`item.is_active`]="{ item }">
          <VChip :color="getStatusColor(item.is_active)" size="small" variant="tonal">
            {{ item.is_active }}
          </VChip>
        </template>

        <template #[`item.questions`]="{ item }">
          <span class="text-body-2 font-weight-medium">{{ getQuestionsCount(item) }}</span>
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
              <span class="text-medium-emphasis">({{ item._responseCount }}/{{ item._totalExpected }})</span>
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

            <!-- Start Date & Time -->
            <VCol cols="12" md="6">
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
            <VCol cols="12" md="6">
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
          </VRow>
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
            Create & Add Questions
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
