<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  startDate?: string
  endDate?: string
  status?: string
}

interface Question {
  id?: number
  question: string
  survey_group_id?: number
}

interface QuestionGroup {
  id?: number
  number: number
  response_style: string
  answer?: string | null
  survey_id?: number
  question_id?: Question[]
}

interface StudentSurvey {
  id?: number
  title: string
  description: string
  instruction: string
  survey_start: string
  survey_end: string
  percentage: number | null
  is_active: 'Active' | 'Draft' | 'Closed'
  academic_term_id: AcademicTerm | number | null
  answer_id?: QuestionGroup[]
  student_id?: any[]
}

// State
const studentSurveys = ref<StudentSurvey[]>([])
const academicTerms = ref<AcademicTerm[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedSurvey = ref<StudentSurvey | null>(null)
const activeTab = ref<'Student' | 'Dean'>('Student')

// Questions management state
const isQuestionsDialogOpen = ref(false)
const currentSurveyForQuestions = ref<StudentSurvey | null>(null)
const questionGroups = ref<QuestionGroup[]>([])
const isLoadingQuestions = ref(false)
const isGroupDialogOpen = ref(false)
const isQuestionDialogOpen = ref(false)
const isEditingGroup = ref(false)
const isEditingQuestion = ref(false)
const selectedGroup = ref<QuestionGroup | null>(null)
const selectedQuestion = ref<Question | null>(null)
const isDeleteGroupDialogOpen = ref(false)
const isDeleteQuestionDialogOpen = ref(false)

const form = ref({
  id: undefined as number | undefined,
  title: '',
  description: '',
  instruction: '',
  is_active: 'Draft' as 'Active' | 'Draft' | 'Closed',
  survey_start: '',
  survey_end: '',
  academic_term_id: null as number | null,
})

const groupForm = ref({
  id: undefined as number | undefined,
  number: 1,
  response_style: 'Likert-Scale Questions',
})

const questionForm = ref({
  id: undefined as number | undefined,
  question: '',
  survey_group_id: undefined as number | undefined,
})

const search = ref('')
const statusFilter = ref<string | null>(null)

// Options
const statusOptions = [
  { title: 'Draft', value: 'Draft' },
  { title: 'Active', value: 'Active' },
  { title: 'Closed', value: 'Closed' },
]

const responseStyleOptions = [
  'Likert-Scale Questions',
  'Multiple Choice',
  'Open-Ended',
  'Yes/No',
  'Rating Scale',
]

// Filtered surveys by status
const filteredSurveys = computed(() => {
  let result = studentSurveys.value

  if (statusFilter.value)
    result = result.filter(s => s.is_active === statusFilter.value)

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(s =>
      s.title.toLowerCase().includes(searchLower)
      || (s.description && s.description.toLowerCase().includes(searchLower)),
    )
  }

  return result
})

// Academic term options for dropdown
const academicTermOptions = computed(() => {
  return academicTerms.value.map(term => ({
    id: term.id,
    title: `${term.semester} - ${term.schoolYear}`,
  }))
})

// Table headers
const headers = [
  { title: 'Title', key: 'title', sortable: true },
  { title: 'Description', key: 'description', sortable: false },
  { title: 'Academic Term', key: 'acadTerm', sortable: false },
  { title: 'Status', key: 'is_active', sortable: true },
  { title: 'Questions', key: 'questions', sortable: false, align: 'center' as const },
  { title: 'Progress', key: 'percentage', sortable: true, align: 'center' as const },
  { title: 'Start Date', key: 'survey_start', sortable: true },
  { title: 'End Date', key: 'survey_end', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active': return 'success'
    case 'Draft': return 'warning'
    case 'Closed': return 'error'
    default: return 'default'
  }
}

// Format datetime
const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Format datetime for input
const formatDateTimeForInput = (dateStr: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toISOString().slice(0, 16)
}

// Get academic term display
const getAcademicTermDisplay = (survey: StudentSurvey): string => {
  if (!survey.academic_term_id) return '-'

  if (typeof survey.academic_term_id === 'object' && survey.academic_term_id !== null) {
    const term = survey.academic_term_id
    if (term.semester && term.schoolYear)
      return `${term.semester} - ${term.schoolYear}`
    return `Term #${term.id}`
  }

  const term = academicTerms.value.find(t => t.id === survey.academic_term_id)
  if (term)
    return `${term.semester} - ${term.schoolYear}`

  return `Term #${survey.academic_term_id}`
}

// Get total questions count for a survey
const getQuestionsCount = (survey: StudentSurvey): number => {
  if (!survey.answer_id || !Array.isArray(survey.answer_id)) return 0
  return survey.answer_id.reduce((total, group) => {
    if (group.question_id && Array.isArray(group.question_id))
      return total + group.question_id.length
    return total
  }, 0)
}

// Fetch student satisfaction surveys
const fetchStudentSurveys = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/StudentSatisfactionSurvey', {
      params: {
        fields: ['*', 'academic_term_id.*', 'answer_id.*', 'answer_id.question_id.*'],
        sort: ['-id'],
      },
    })

    studentSurveys.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch student surveys:', error)
    studentSurveys.value = []
  }
  finally {
    isLoading.value = false
  }
}

// Fetch academic terms
const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        sort: '-schoolYear',
      },
    })

    academicTerms.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

// Open dialog for creating new survey
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    id: undefined,
    title: '',
    description: '',
    instruction: '',
    is_active: 'Draft',
    survey_start: '',
    survey_end: '',
    academic_term_id: null,
  }
  isDialogOpen.value = true
}

// Open dialog for editing survey
const openEditDialog = (survey: StudentSurvey) => {
  isEditing.value = true

  let termId: number | null = null
  if (survey.academic_term_id) {
    termId = typeof survey.academic_term_id === 'object'
      ? survey.academic_term_id.id
      : survey.academic_term_id
  }

  form.value = {
    id: survey.id,
    title: survey.title,
    description: survey.description || '',
    instruction: survey.instruction || '',
    is_active: survey.is_active,
    survey_start: formatDateTimeForInput(survey.survey_start),
    survey_end: formatDateTimeForInput(survey.survey_end),
    academic_term_id: termId,
  }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (survey: StudentSurvey) => {
  selectedSurvey.value = survey
  isDeleteDialogOpen.value = true
}

// Save survey
const saveSurvey = async () => {
  try {
    const body = {
      title: form.value.title,
      description: form.value.description,
      instruction: form.value.instruction,
      is_active: form.value.is_active,
      survey_start: form.value.survey_start || null,
      survey_end: form.value.survey_end || null,
      academic_term_id: form.value.academic_term_id,
    }

    if (isEditing.value && form.value.id) {
      await $api(`/items/StudentSatisfactionSurvey/${form.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $api('/items/StudentSatisfactionSurvey', {
        method: 'POST',
        body,
      })
    }

    isDialogOpen.value = false
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to save survey:', error)
  }
}

// Delete survey
const deleteSurvey = async () => {
  if (!selectedSurvey.value?.id)
    return

  try {
    await $api(`/items/StudentSatisfactionSurvey/${selectedSurvey.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedSurvey.value = null
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to delete survey:', error)
  }
}

// ==================== Questions Management ====================

// Open questions dialog
const openQuestionsDialog = async (survey: StudentSurvey) => {
  currentSurveyForQuestions.value = survey
  isQuestionsDialogOpen.value = true
  await fetchQuestionGroups(survey.id!)
}

// Fetch question groups for a survey
const fetchQuestionGroups = async (surveyId: number) => {
  isLoadingQuestions.value = true
  try {
    // Fetch the survey with its question groups and questions
    const res = await $api(`/items/StudentSatisfactionSurvey/${surveyId}`, {
      params: {
        fields: ['answer_id.*', 'answer_id.question_id.*'],
      },
    })

    questionGroups.value = res.data?.answer_id || []
  }
  catch (error) {
    console.error('Failed to fetch question groups:', error)
    questionGroups.value = []
  }
  finally {
    isLoadingQuestions.value = false
  }
}

// Open add group dialog
const openAddGroupDialog = () => {
  isEditingGroup.value = false
  const nextNumber = questionGroups.value.length + 1
  groupForm.value = {
    id: undefined,
    number: nextNumber,
    response_style: 'Likert-Scale Questions',
  }
  isGroupDialogOpen.value = true
}

// Open edit group dialog
const openEditGroupDialog = (group: QuestionGroup) => {
  isEditingGroup.value = true
  selectedGroup.value = group
  groupForm.value = {
    id: group.id,
    number: group.number,
    response_style: group.response_style,
  }
  isGroupDialogOpen.value = true
}

// Save question group
const saveQuestionGroup = async () => {
  if (!currentSurveyForQuestions.value?.id) return

  try {
    const body = {
      number: groupForm.value.number,
      response_style: groupForm.value.response_style,
      survey_id: currentSurveyForQuestions.value.id,
    }

    if (isEditingGroup.value && groupForm.value.id) {
      await $api(`/items/survey_groups/${groupForm.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $api('/items/survey_groups', {
        method: 'POST',
        body,
      })
    }

    isGroupDialogOpen.value = false
    await fetchQuestionGroups(currentSurveyForQuestions.value.id)
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to save question group:', error)
  }
}

// Open delete group dialog
const openDeleteGroupDialog = (group: QuestionGroup) => {
  selectedGroup.value = group
  isDeleteGroupDialogOpen.value = true
}

// Delete question group
const deleteQuestionGroup = async () => {
  if (!selectedGroup.value?.id || !currentSurveyForQuestions.value?.id) return

  try {
    await $api(`/items/survey_groups/${selectedGroup.value.id}`, {
      method: 'DELETE',
    })

    isDeleteGroupDialogOpen.value = false
    selectedGroup.value = null
    await fetchQuestionGroups(currentSurveyForQuestions.value.id)
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to delete question group:', error)
  }
}

// Open add question dialog
const openAddQuestionDialog = (group: QuestionGroup) => {
  isEditingQuestion.value = false
  selectedGroup.value = group
  questionForm.value = {
    id: undefined,
    question: '',
    survey_group_id: group.id,
  }
  isQuestionDialogOpen.value = true
}

// Open edit question dialog
const openEditQuestionDialog = (question: Question, group: QuestionGroup) => {
  isEditingQuestion.value = true
  selectedGroup.value = group
  selectedQuestion.value = question
  questionForm.value = {
    id: question.id,
    question: question.question,
    survey_group_id: group.id,
  }
  isQuestionDialogOpen.value = true
}

// Save question
const saveQuestion = async () => {
  if (!currentSurveyForQuestions.value?.id || !questionForm.value.survey_group_id) return

  try {
    const body = {
      question: questionForm.value.question,
      survey_group_id: questionForm.value.survey_group_id,
    }

    if (isEditingQuestion.value && questionForm.value.id) {
      await $api(`/items/survey_questions/${questionForm.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $api('/items/survey_questions', {
        method: 'POST',
        body,
      })
    }

    isQuestionDialogOpen.value = false
    await fetchQuestionGroups(currentSurveyForQuestions.value.id)
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to save question:', error)
  }
}

// Open delete question dialog
const openDeleteQuestionDialog = (question: Question, group: QuestionGroup) => {
  selectedQuestion.value = question
  selectedGroup.value = group
  isDeleteQuestionDialogOpen.value = true
}

// Delete question
const deleteQuestion = async () => {
  if (!selectedQuestion.value?.id || !currentSurveyForQuestions.value?.id) return

  try {
    await $api(`/items/survey_questions/${selectedQuestion.value.id}`, {
      method: 'DELETE',
    })

    isDeleteQuestionDialogOpen.value = false
    selectedQuestion.value = null
    await fetchQuestionGroups(currentSurveyForQuestions.value.id)
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to delete question:', error)
  }
}

// Watch for tab changes to fetch appropriate data
watch(activeTab, (newTab) => {
  if (newTab === 'Student') {
    fetchStudentSurveys()
  }
  // Dean tab - no collection yet
})

// Fetch data on mount
onMounted(() => {
  fetchStudentSurveys()
  fetchAcademicTerms()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="pa-6">
        <div class="d-flex align-center">
          <VIcon icon="ri-survey-line" size="28" class="me-3" />
          <span class="text-h5">Surveys</span>
        </div>
      </VCardTitle>

      <VDivider />

      <!-- Tabs for Survey Types -->
      <VTabs v-model="activeTab" class="px-4">
        <VTab value="Student">
          <VIcon icon="ri-emotion-happy-line" class="me-2" />
          Student Satisfaction Survey
        </VTab>
        <VTab value="Dean">
          <VIcon icon="ri-user-settings-line" class="me-2" />
          Dean Evaluation
        </VTab>
      </VTabs>

      <VDivider />

      <!-- Student Satisfaction Survey Tab -->
      <template v-if="activeTab === 'Student'">
        <!-- Toolbar -->
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
          <VBtn
            color="primary"
            prepend-icon="ri-add-line"
            @click="openCreateDialog"
          >
            Create Survey
          </VBtn>
        </div>

        <VDivider />

        <!-- Survey Table -->
        <VDataTable
          :headers="headers"
          :items="filteredSurveys"
          :loading="isLoading"
          hover
        >
          <template #item.title="{ item }">
            <span class="font-weight-medium">{{ item.title }}</span>
          </template>

          <template #item.description="{ item }">
            <span class="text-truncate d-inline-block" style="max-width: 200px;">
              {{ item.description || '-' }}
            </span>
          </template>

          <template #item.acadTerm="{ item }">
            <VChip size="small" variant="tonal" color="secondary">
              {{ getAcademicTermDisplay(item) }}
            </VChip>
          </template>

          <template #item.is_active="{ item }">
            <VChip
              :color="getStatusColor(item.is_active)"
              size="small"
              variant="tonal"
            >
              {{ item.is_active }}
            </VChip>
          </template>

          <template #item.questions="{ item }">
            <VBtn
              size="small"
              variant="tonal"
              color="info"
              @click="openQuestionsDialog(item)"
            >
              <VIcon icon="ri-question-line" class="me-1" />
              {{ getQuestionsCount(item) }}
            </VBtn>
          </template>

          <template #item.percentage="{ item }">
            <div class="d-flex align-center gap-2" style="min-width: 100px;">
              <VProgressLinear
                :model-value="item.percentage || 0"
                :color="item.percentage >= 75 ? 'success' : item.percentage >= 50 ? 'warning' : 'primary'"
                height="8"
                rounded
              />
              <span class="text-caption">{{ item.percentage || 0 }}%</span>
            </div>
          </template>

          <template #item.survey_start="{ item }">
            {{ formatDateTime(item.survey_start) }}
          </template>

          <template #item.survey_end="{ item }">
            {{ formatDateTime(item.survey_end) }}
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex justify-center gap-1">
              <IconBtn
                size="small"
                @click="openEditDialog(item)"
              >
                <VIcon icon="ri-pencil-line" />
              </IconBtn>
              <IconBtn
                size="small"
                color="error"
                @click="openDeleteDialog(item)"
              >
                <VIcon icon="ri-delete-bin-line" />
              </IconBtn>
            </div>
          </template>

          <template #no-data>
            <div class="text-center pa-8">
              <VIcon
                icon="ri-emotion-happy-line"
                size="64"
                color="medium-emphasis"
                class="mb-4"
              />
              <p class="text-h6 text-medium-emphasis mb-2">
                No Student Satisfaction Surveys
              </p>
              <p class="text-body-2 text-medium-emphasis mb-4">
                Create your first survey to start collecting feedback
              </p>
              <VBtn
                color="primary"
                prepend-icon="ri-add-line"
                @click="openCreateDialog"
              >
                Create Survey
              </VBtn>
            </div>
          </template>
        </VDataTable>
      </template>

      <!-- Dean Evaluation Tab -->
      <template v-else>
        <div class="text-center pa-16">
          <VIcon
            icon="ri-user-settings-line"
            size="80"
            color="medium-emphasis"
            class="mb-4"
          />
          <p class="text-h5 text-medium-emphasis mb-2">
            Dean Evaluation
          </p>
          <p class="text-body-1 text-medium-emphasis">
            This feature is coming soon
          </p>
        </div>
      </template>
    </VCard>

    <!-- Create/Edit Survey Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="700"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          <div class="d-flex align-center">
            <VIcon icon="ri-emotion-happy-line" class="me-3" />
            {{ isEditing ? 'Edit Survey' : 'Create New Survey' }}
          </div>
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="form.title"
                label="Survey Title"
                placeholder="Enter survey title"
                variant="outlined"
                :rules="[v => !!v || 'Title is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.academic_term_id"
                label="Academic Term"
                :items="academicTermOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                clearable
                placeholder="Select academic term..."
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="form.description"
                label="Description"
                placeholder="Enter survey description"
                variant="outlined"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="form.instruction"
                label="Instructions"
                placeholder="Enter survey instructions for respondents"
                variant="outlined"
                rows="3"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VSelect
                v-model="form.is_active"
                label="Status"
                :items="statusOptions"
                item-title="title"
                item-value="value"
                variant="outlined"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="form.survey_start"
                label="Start Date & Time"
                type="datetime-local"
                variant="outlined"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="form.survey_end"
                label="End Date & Time"
                type="datetime-local"
                variant="outlined"
              />
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :disabled="!form.title"
            @click="saveSurvey"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Survey Dialog -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Delete Survey
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ selectedSurvey?.title }}</strong>?
          This action cannot be undone and all associated responses will be lost.
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="error"
            @click="deleteSurvey"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Questions Management Dialog -->
    <VDialog
      v-model="isQuestionsDialogOpen"
      max-width="900"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          <div class="d-flex align-center justify-space-between w-100">
            <div class="d-flex align-center">
              <VIcon icon="ri-question-line" class="me-3" />
              <div>
                <span class="text-h6">Manage Questions</span>
                <div class="text-caption text-medium-emphasis">
                  {{ currentSurveyForQuestions?.title }}
                </div>
              </div>
            </div>
            <VBtn
              color="primary"
              size="small"
              prepend-icon="ri-add-line"
              @click="openAddGroupDialog"
            >
              Add Group
            </VBtn>
          </div>
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-0" style="max-height: 600px; overflow-y: auto;">
          <div v-if="isLoadingQuestions" class="text-center pa-8">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <div v-else-if="questionGroups.length === 0" class="text-center pa-8">
            <VIcon icon="ri-question-line" size="64" color="medium-emphasis" class="mb-4" />
            <p class="text-h6 text-medium-emphasis mb-2">No Question Groups</p>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Add a question group to start creating questions
            </p>
            <VBtn
              color="primary"
              prepend-icon="ri-add-line"
              @click="openAddGroupDialog"
            >
              Add Group
            </VBtn>
          </div>

          <VExpansionPanels v-else variant="accordion">
            <VExpansionPanel
              v-for="group in questionGroups"
              :key="group.id"
            >
              <VExpansionPanelTitle>
                <div class="d-flex align-center justify-space-between w-100 pe-4">
                  <div class="d-flex align-center gap-3">
                    <VAvatar color="primary" variant="tonal" size="36">
                      {{ group.number }}
                    </VAvatar>
                    <div>
                      <span class="font-weight-medium">Group {{ group.number }}</span>
                      <VChip size="x-small" variant="tonal" class="ms-2">
                        {{ group.response_style }}
                      </VChip>
                    </div>
                  </div>
                  <VChip size="small" variant="tonal" color="info">
                    {{ group.question_id?.length || 0 }} questions
                  </VChip>
                </div>
              </VExpansionPanelTitle>

              <VExpansionPanelText>
                <div class="d-flex justify-end mb-4 gap-2">
                  <VBtn
                    size="small"
                    variant="tonal"
                    @click.stop="openEditGroupDialog(group)"
                  >
                    <VIcon icon="ri-pencil-line" class="me-1" />
                    Edit Group
                  </VBtn>
                  <VBtn
                    size="small"
                    variant="tonal"
                    color="error"
                    @click.stop="openDeleteGroupDialog(group)"
                  >
                    <VIcon icon="ri-delete-bin-line" class="me-1" />
                    Delete Group
                  </VBtn>
                  <VBtn
                    size="small"
                    color="primary"
                    @click.stop="openAddQuestionDialog(group)"
                  >
                    <VIcon icon="ri-add-line" class="me-1" />
                    Add Question
                  </VBtn>
                </div>

                <VList v-if="group.question_id && group.question_id.length > 0" density="compact">
                  <VListItem
                    v-for="(question, qIndex) in group.question_id"
                    :key="question.id"
                    class="border rounded mb-2"
                  >
                    <template #prepend>
                      <span class="text-caption text-medium-emphasis me-3">{{ qIndex + 1 }}.</span>
                    </template>

                    <VListItemTitle>{{ question.question }}</VListItemTitle>

                    <template #append>
                      <div class="d-flex gap-1">
                        <IconBtn
                          size="small"
                          @click="openEditQuestionDialog(question, group)"
                        >
                          <VIcon icon="ri-pencil-line" size="18" />
                        </IconBtn>
                        <IconBtn
                          size="small"
                          color="error"
                          @click="openDeleteQuestionDialog(question, group)"
                        >
                          <VIcon icon="ri-delete-bin-line" size="18" />
                        </IconBtn>
                      </div>
                    </template>
                  </VListItem>
                </VList>

                <div v-else class="text-center pa-4 text-medium-emphasis">
                  No questions in this group. Click "Add Question" to create one.
                </div>
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isQuestionsDialogOpen = false"
          >
            Close
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Add/Edit Group Dialog -->
    <VDialog
      v-model="isGroupDialogOpen"
      max-width="500"
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditingGroup ? 'Edit Question Group' : 'Add Question Group' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="4">
              <VTextField
                v-model.number="groupForm.number"
                label="Group Number"
                type="number"
                min="1"
                variant="outlined"
              />
            </VCol>
            <VCol cols="12" md="8">
              <VSelect
                v-model="groupForm.response_style"
                label="Response Style"
                :items="responseStyleOptions"
                variant="outlined"
              />
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isGroupDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            @click="saveQuestionGroup"
          >
            {{ isEditingGroup ? 'Update' : 'Add' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Group Dialog -->
    <VDialog
      v-model="isDeleteGroupDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">Delete Question Group</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          Are you sure you want to delete <strong>Group {{ selectedGroup?.number }}</strong>?
          This will also delete all questions in this group.
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDeleteGroupDialogOpen = false">Cancel</VBtn>
          <VBtn color="error" @click="deleteQuestionGroup">Delete</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Add/Edit Question Dialog -->
    <VDialog
      v-model="isQuestionDialogOpen"
      max-width="600"
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditingQuestion ? 'Edit Question' : 'Add Question' }}
          <div class="text-caption text-medium-emphasis">
            Group {{ selectedGroup?.number }} - {{ selectedGroup?.response_style }}
          </div>
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VTextarea
            v-model="questionForm.question"
            label="Question"
            placeholder="Enter your question..."
            variant="outlined"
            rows="3"
            :rules="[v => !!v || 'Question is required']"
          />
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isQuestionDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :disabled="!questionForm.question"
            @click="saveQuestion"
          >
            {{ isEditingQuestion ? 'Update' : 'Add' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Question Dialog -->
    <VDialog
      v-model="isDeleteQuestionDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">Delete Question</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          Are you sure you want to delete this question?
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDeleteQuestionDialogOpen = false">Cancel</VBtn>
          <VBtn color="error" @click="deleteQuestion">Delete</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
