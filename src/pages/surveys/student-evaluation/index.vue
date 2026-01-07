<script setup lang="ts">
import { $api } from '@/utils/api'
import { STUDENT_EVALUATION_TYPE_OPTIONS, SURVEY_STATUS_OPTIONS, YEAR_LEVEL_OPTIONS } from '@/utils/constants'

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

interface ClassStudent {
  students_id: number | { id: number }
}

interface SurveyClass {
  classes_id: number | {
    id: number
    student_id?: ClassStudent[]
  }
}

interface SchoolOffice {
  id: number
  name: string
  is_active?: boolean
}

interface SurveyStudent {
  students_id: number
}

interface StudentSurvey {
  id?: number
  title: string
  instruction: string
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: AcademicTerm | number | null
  evaluation_type: 'Class' | 'Office'
  office_id?: SchoolOffice | number | null
  assignment_mode?: 'all' | 'department' | 'specific'
  student_percentage?: number
  question_group?: StudentSurveyGroup[]
  classes?: SurveyClass[]
  students?: SurveyStudent[]
  _responseCount?: number
  _totalStudents?: number
}

interface StudentSurveyForm {
  id?: number
  title: string
  instruction: string
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: number | null
  evaluation_type: 'Class' | 'Office'
  office_id: number | null
  target_year_levels: string[]
}

// ==================== STATE ====================

const academicTerms = ref<AcademicTerm[]>([])
const schoolOffices = ref<SchoolOffice[]>([])
const isLoading = ref(false)
const studentSurveys = ref<StudentSurvey[]>([])
const totalStudentsWithClasses = ref(0)
const isDeleteDialogOpen = ref(false)
const isCreateDialogOpen = ref(false)
const isSaving = ref(false)
const selectedSurvey = ref<StudentSurvey | null>(null)
const search = ref('')
const statusFilter = ref<string | null>(null)

// Date picker menu state
const startDateMenu = ref(false)
const endDateMenu = ref(false)

const form = ref<StudentSurveyForm>({
  title: '',
  instruction: '',
  survey_start: '',
  survey_end: '',
  is_active: '' as 'Active' | 'Draft' | 'Archived',
  academic_term_id: null,
  evaluation_type: '' as 'Class' | 'Office',
  office_id: null,
  target_year_levels: [],
})

// ==================== OPTIONS ====================

const statusOptions = SURVEY_STATUS_OPTIONS

const evaluationTypeOptions = STUDENT_EVALUATION_TYPE_OPTIONS

// ==================== COMPUTED ====================

const filteredSurveys = computed(() => {
  let result = studentSurveys.value

  if (statusFilter.value)
    result = result.filter((s: StudentSurvey) => s.is_active === statusFilter.value)

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter((s: StudentSurvey) =>
      s.title.toLowerCase().includes(searchLower),
    )
  }

  return result
})

// ==================== TABLE HEADERS ====================

const headers = [
  { title: 'Title', key: 'title', sortable: true },
  { title: 'Type', key: 'evaluation_type', sortable: true },
  { title: 'Academic Term', key: 'acadTerm', sortable: false },
  { title: 'Status', key: 'is_active', sortable: true },
  { title: 'Questions', key: 'questions', sortable: false, align: 'center' as const },
  { title: 'Progress', key: 'percentage', sortable: true, align: 'center' as const },
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

const getEvaluationTypeDisplay = (survey: StudentSurvey): string => {
  if (survey.evaluation_type === 'Office') {
    if (survey.office_id) {
      if (typeof survey.office_id === 'object') {
        return survey.office_id.name
      }
      const office = schoolOffices.value.find(o => o.id === survey.office_id)
      return office?.name || 'Office'
    }
    return 'Office'
  }
  return 'Class'
}

const getEvaluationTypeColor = (type: string): string => {
  return type === 'Office' ? 'info' : 'primary'
}

const getAcademicTermDisplay = (survey: StudentSurvey): string => {
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

const getQuestionsCount = (survey: StudentSurvey): number => {
  if (!survey.question_group || !Array.isArray(survey.question_group)) return 0
  return survey.question_group.reduce((total, group) => {
    if (group.questions && Array.isArray(group.questions))
      return total + group.questions.length
    return total
  }, 0)
}

const getTotalStudents = (survey: StudentSurvey): number => {
  // Now that students are assigned to the junction table based on student_percentage,
  // we can simply count the students in the junction table
  if (survey.students && Array.isArray(survey.students) && survey.students.length > 0) {
    return survey.students.length
  }

  // Fallback for old surveys that don't have students assigned yet
  // (calculate based on classes/offices and apply percentage)
  let total = 0

  // For class-based surveys, count students from assigned classes
  if (survey.evaluation_type === 'Class') {
    if (!survey.classes || !Array.isArray(survey.classes)) return 0

    for (const classItem of survey.classes) {
      if (typeof classItem.classes_id === 'object' && classItem.classes_id !== null) {
        const classData = classItem.classes_id
        if (classData.student_id && Array.isArray(classData.student_id)) {
          total += classData.student_id.length
        }
      }
    }
  }
  // For office-based surveys, count based on assignment_mode
  else if (survey.evaluation_type === 'Office') {
    const assignmentMode = survey.assignment_mode || 'all'

    if (assignmentMode === 'all') {
      // All students with at least one enrolled class
      total = totalStudentsWithClasses.value
    }
    else {
      // For 'specific' and 'department' modes, students are stored in junction table
      if (!survey.students || !Array.isArray(survey.students)) return 0
      total = survey.students.length
    }
  }

  // Apply student_percentage if set (default to 100%)
  const percentage = survey.student_percentage ?? 100
  return Math.ceil(total * (percentage / 100))
}

const getProgress = (survey: StudentSurvey): number => {
  const totalStudents = survey._totalStudents ?? getTotalStudents(survey)
  const responseCount = survey._responseCount ?? 0

  if (totalStudents === 0) return 0
  return Math.round((responseCount / totalStudents) * 100)
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

const fetchSchoolOffices = async () => {
  try {
    const res = await $api('/items/SchoolOffices', {
      params: {
        filter: { is_active: { _eq: true } },
        sort: ['name'],
      },
    })
    schoolOffices.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch school offices:', error)
  }
}

const fetchTotalStudentsWithClasses = async () => {
  try {
    // Count unique students from all classes
    const res = await $api('/items/classes', {
      params: {
        fields: ['student_id.students_id'],
        limit: -1,
      },
    })
    // Count unique students across all classes
    const studentIds = new Set<number>()
    for (const cls of res.data || []) {
      if (Array.isArray(cls.student_id)) {
        cls.student_id.forEach((s: any) => {
          // Handle junction table format: { students_id: number }
          const id = s?.students_id ?? (typeof s === 'object' ? s.id : s)
          if (id) studentIds.add(id)
        })
      }
    }
    totalStudentsWithClasses.value = studentIds.size
  }
  catch (error) {
    console.error('Failed to fetch total students count:', error)
  }
}

const fetchSurveys = async () => {
  isLoading.value = true
  try {
    // Fetch total students with classes first (needed for 'all' assignment mode)
    await fetchTotalStudentsWithClasses()

    const res = await $api('/items/StudentEvaluationSurvey', {
      params: {
        fields: [
          '*',
          'academic_term_id.*',
          'office_id.*',
          'question_group.*',
          'question_group.questions.*',
          'classes.classes_id.id',
          'classes.classes_id.student_id',
          'students.students_id',
        ],
        sort: ['-id'],
      },
    })

    const surveys: StudentSurvey[] = res.data

    for (const survey of surveys) {
      if (survey.id) {
        try {
          const responseRes = await $api('/items/StudentSurveyResponses', {
            params: {
              filter: { survey_id: { _eq: survey.id } },
              aggregate: { count: '*' },
            },
          })
          survey._responseCount = responseRes.data?.[0]?.count
        }
        catch {
          // Failed to get response count
        }
        survey._totalStudents = getTotalStudents(survey)
      }
    }

    studentSurveys.value = surveys
  }
  catch (error) {
    console.error('Failed to fetch student surveys:', error)
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
    evaluation_type: '' as 'Class' | 'Office',
    office_id: null,
    target_year_levels: [],
  }
  isCreateDialogOpen.value = true
}

const saveSurvey = async () => {
  if (!form.value.title.trim()) return

  // Validate office selection for office-based surveys
  if (form.value.evaluation_type === 'Office' && !form.value.office_id) {
    alert('Please select a school office')
    return
  }

  isSaving.value = true
  try {
    const response = await $api('/items/StudentEvaluationSurvey', {
      method: 'POST',
      body: {
        title: form.value.title,
        instruction: form.value.instruction,
        survey_start: form.value.survey_start || null,
        survey_end: form.value.survey_end || null,
        is_active: form.value.is_active,
        academic_term_id: form.value.academic_term_id,
        evaluation_type: form.value.evaluation_type,
        office_id: form.value.evaluation_type === 'Office' ? form.value.office_id : null,
        assignment_mode: form.value.evaluation_type === 'Office' ? 'all' : null,
        target_year_levels: form.value.target_year_levels.length > 0 ? form.value.target_year_levels : null,
      },
    })

    isCreateDialogOpen.value = false

    // Navigate to the detail page to add questions
    const createdSurveyId = response.data?.id
    if (createdSurveyId) {
      router.push(`/surveys/student-evaluation/${createdSurveyId}`)
    }
    else {
      await fetchSurveys()
    }
  }
  catch (error) {
    console.error('Failed to create survey:', error)
  }
  finally {
    isSaving.value = false
  }
}

const goToSurvey = (survey: StudentSurvey) => {
  if (survey.id) {
    router.push(`/surveys/student-evaluation/${survey.id}`)
  }
}

const handleRowClick = (_event: Event, row: { item: StudentSurvey }) => {
  goToSurvey(row.item)
}

const openDeleteDialog = (survey: StudentSurvey) => {
  selectedSurvey.value = survey
  isDeleteDialogOpen.value = true
}

const deleteSurvey = async () => {
  if (!selectedSurvey.value?.id) return

  try {
    // First, delete all responses associated with this survey
    const responsesRes = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { survey_id: { _eq: selectedSurvey.value.id } },
        fields: ['id'],
      },
    })

    if (responsesRes.data?.length > 0) {
      // Delete each response
      await Promise.all(
        responsesRes.data.map((response: { id: number }) =>
          $api(`/items/StudentSurveyResponses/${response.id}`, { method: 'DELETE' }),
        ),
      )
    }

    // Then delete the survey
    await $api(`/items/StudentEvaluationSurvey/${selectedSurvey.value.id}`, {
      method: 'DELETE',
    })
    isDeleteDialogOpen.value = false
    selectedSurvey.value = null
    await fetchSurveys()
  }
  catch (error) {
    console.error('Failed to delete survey:', error)
  }
}

// ==================== LIFECYCLE ====================

onMounted(() => {
  fetchSurveys()
  fetchAcademicTerms()
  fetchSchoolOffices()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="pa-6">
        <div class="d-flex align-center">
          <span class="text-h5">Student Evaluation Survey</span>
        </div>
      </VCardTitle>

      <VDivider />

      <div class="d-flex align-center pa-4 gap-4">
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search surveys..."
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
          Create Survey
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

        <template #[`item.evaluation_type`]="{ item }">
          <VChip
            :color="getEvaluationTypeColor(item.evaluation_type || 'class')"
            size="small"
            variant="tonal"
          >
            {{ getEvaluationTypeDisplay(item) }}
          </VChip>
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

        <template #[`item.percentage`]="{ item }">
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
              <span class="text-medium-emphasis">({{ item._responseCount }}/{{ item._totalStudents }})</span>
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
            <VIcon icon="ri-emotion-happy-line" size="64" color="medium-emphasis" class="mb-4" />
            <p class="text-h6 text-medium-emphasis mb-2">No Student Satisfaction Surveys</p>
            <p class="text-body-2 text-medium-emphasis mb-4">Create your first survey to start collecting feedback</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Delete Survey Dialog -->
    <VDialog v-model="isDeleteDialogOpen" max-width="450">
      <VCard>
        <VCardTitle class="pa-6">Delete Survey</VCardTitle>
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
            <strong>Warning:</strong> All responses and data associated with this survey will be permanently deleted. This action cannot be undone.
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
          Create New Survey
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
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
                rows="2"
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
