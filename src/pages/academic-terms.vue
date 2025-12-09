<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'academicTerms',
  },
})

interface AcademicTerm {
  id?: number
  schoolYear: string
  startDate: string
  endDate: string
  semester: string
  status: string
}

// State
const academicTerms = ref<AcademicTerm[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedTerm = ref<AcademicTerm | null>(null)

const form = ref<AcademicTerm>({
  schoolYear: '',
  startDate: '',
  endDate: '',
  semester: 'First Semester',
  status: 'Draft',
})

const search = ref('')

// Options
const semesterOptions = ['First Semester', 'Second Semester']
const statusOptions = ['Draft', 'Active', 'Archived']

// Table headers
const headers = [
  { title: 'School Year', key: 'schoolYear', sortable: true },
  { title: 'Semester', key: 'semester', sortable: true },
  { title: 'Start Date', key: 'startDate', sortable: true },
  { title: 'End Date', key: 'endDate', sortable: true },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Format date for display
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString)
    return '-'

  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active':
      return 'success'
    case 'Archived':
      return 'secondary'
    case 'Draft':
      return 'warning'
    default:
      return 'default'
  }
}

// Fetch academic terms from Directus
const fetchAcademicTerms = async () => {
  isLoading.value = true
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
  finally {
    isLoading.value = false
  }
}

// Open dialog for creating new term
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    schoolYear: '',
    startDate: '',
    endDate: '',
    semester: 'First Semester',
    status: 'Draft',
  }
  isDialogOpen.value = true
}

// Open dialog for editing term
const openEditDialog = (term: AcademicTerm) => {
  isEditing.value = true
  form.value = { ...term }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (term: AcademicTerm) => {
  selectedTerm.value = term
  isDeleteDialogOpen.value = true
}

// Check if this is the only active term
const isOnlyActiveTerm = computed(() => {
  if (!isEditing.value || !form.value.id)
    return false

  const originalTerm = academicTerms.value.find(t => t.id === form.value.id)
  if (originalTerm?.status !== 'Active')
    return false

  const activeTerms = academicTerms.value.filter(t => t.status === 'Active')

  return activeTerms.length === 1
})

// Get available status options based on current state
const availableStatusOptions = computed(() => {
  if (isOnlyActiveTerm.value) {
    // If this is the only active term, only allow "Active" status
    return ['Active']
  }

  return statusOptions
})

// Save term (create or update)
const saveTerm = async () => {
  // Validation: Can't change the only active term to another status
  if (isEditing.value && isOnlyActiveTerm.value && form.value.status !== 'Active') {
    alert('Cannot change status. There must always be at least one active academic term.')

    return
  }

  try {
    if (isEditing.value && form.value.id) {
      // Update existing term
      await $api(`/items/academicTerms/${form.value.id}`, {
        method: 'PATCH',
        body: {
          schoolYear: form.value.schoolYear,
          startDate: form.value.startDate,
          endDate: form.value.endDate,
          semester: form.value.semester,
          status: form.value.status,
        },
      })
    }
    else {
      // Create new term
      await $api('/items/academicTerms', {
        method: 'POST',
        body: {
          schoolYear: form.value.schoolYear,
          startDate: form.value.startDate,
          endDate: form.value.endDate,
          semester: form.value.semester,
          status: form.value.status,
        },
      })
    }

    isDialogOpen.value = false
    await fetchAcademicTerms()
  }
  catch (error) {
    console.error('Failed to save academic term:', error)
  }
}

// Check if selected term is the only active term (for delete)
const isSelectedOnlyActiveTerm = computed(() => {
  if (!selectedTerm.value)
    return false

  if (selectedTerm.value.status !== 'Active')
    return false

  const activeTerms = academicTerms.value.filter(t => t.status === 'Active')

  return activeTerms.length === 1
})

// Delete term
const deleteTerm = async () => {
  if (!selectedTerm.value?.id)
    return

  // Validation: Can't delete the only active term
  if (isSelectedOnlyActiveTerm.value) {
    alert('Cannot delete. There must always be at least one active academic term.')
    isDeleteDialogOpen.value = false

    return
  }

  try {
    await $api(`/items/academicTerms/${selectedTerm.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedTerm.value = null
    await fetchAcademicTerms()
  }
  catch (error) {
    console.error('Failed to delete academic term:', error)
  }
}

// Fetch terms on mount
onMounted(() => {
  fetchAcademicTerms()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Academic Terms</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search academic terms..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Academic Term
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="academicTerms"
        :search="search"
        :loading="isLoading"
        hover
      >
        <template #item.startDate="{ item }">
          {{ formatDate(item.startDate) }}
        </template>

        <template #item.endDate="{ item }">
          {{ formatDate(item.endDate) }}
        </template>

        <template #item.status="{ item }">
          <VChip
            :color="getStatusColor(item.status)"
            size="small"
          >
            {{ item.status }}
          </VChip>
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
          <div class="text-center pa-4">
            <p class="text-body-1 text-medium-emphasis">No academic terms found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="500"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Academic Term' : 'Add New Academic Term' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="form.schoolYear"
                label="School Year"
                placeholder="e.g., 2025-2026"
                variant="outlined"
                :rules="[v => !!v || 'School year is required']"
              />
            </VCol>
            <VCol cols="12">
              <VSelect
                v-model="form.semester"
                label="Semester"
                :items="semesterOptions"
                variant="outlined"
                :rules="[v => !!v || 'Semester is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="form.startDate"
                label="Start Date"
                type="date"
                variant="outlined"
                :rules="[v => !!v || 'Start date is required']"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="form.endDate"
                label="End Date"
                type="date"
                variant="outlined"
                :rules="[v => !!v || 'End date is required']"
              />
            </VCol>
            <VCol cols="12">
              <VSelect
                v-model="form.status"
                label="Status"
                :items="availableStatusOptions"
                variant="outlined"
                :rules="[v => !!v || 'Status is required']"
                :hint="isOnlyActiveTerm ? 'This is the only active term. Status cannot be changed.' : ''"
                :persistent-hint="isOnlyActiveTerm"
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
            :disabled="!form.schoolYear || !form.semester || !form.startDate || !form.endDate || !form.status"
            @click="saveTerm"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Confirmation Dialog -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Delete Academic Term
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <template v-if="isSelectedOnlyActiveTerm">
            <VAlert
              type="error"
              variant="tonal"
              class="mb-4"
            >
              Cannot delete the only active academic term. There must always be at least one active term.
            </VAlert>
          </template>
          <template v-else>
            Are you sure you want to delete <strong>{{ selectedTerm?.schoolYear }} - {{ selectedTerm?.semester }}</strong>?
            This action cannot be undone.
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            {{ isSelectedOnlyActiveTerm ? 'Close' : 'Cancel' }}
          </VBtn>
          <VBtn
            v-if="!isSelectedOnlyActiveTerm"
            color="error"
            @click="deleteTerm"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
