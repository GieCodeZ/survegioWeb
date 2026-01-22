<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'classSection',
    allowedRoles: ['administrator'],
  },
})

interface Program {
  id: number
  programCode: string
  programName: string
}

interface ClassSection {
  id?: number
  section: string[]
  program_id: number | { id: number; programCode: string } | null
}

// State
const classSections = ref<ClassSection[]>([])
const programs = ref<Program[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedClassSection = ref<ClassSection | null>(null)

// Deletion prevention state
const isCheckingDeletion = ref(false)
const deletionBlockedReason = ref<string | null>(null)
const relatedClasses = ref<any[]>([])

const form = ref<ClassSection>({
  section: [],
  program_id: null,
})

const search = ref('')

// Bulk add sections input
const bulkSectionsInput = ref('')

// Add multiple sections from space-separated input
const addBulkSections = () => {
  if (!bulkSectionsInput.value.trim()) return

  // Split by spaces, commas, or newlines and filter empty values
  // Only allow sections in format: number + letter (e.g., 1A, 2B, 3C)
  const newSections = bulkSectionsInput.value
    .split(/[\s,]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => /^\d+[A-Z]$/.test(s))

  // Add unique sections that don't already exist
  for (const section of newSections) {
    if (!form.value.section.includes(section)) {
      form.value.section.push(section)
    }
  }

  // Clear input
  bulkSectionsInput.value = ''
}

// Remove a section from the list
const removeSection = (section: string) => {
  const index = form.value.section.indexOf(section)
  if (index > -1) {
    form.value.section.splice(index, 1)
  }
}

// Table headers
const headers = [
  { title: 'Program', key: 'program', sortable: true },
  { title: 'Sections', key: 'section', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

const snackbar = ref({
  show: false,
  message: '',
  color: 'success', 
})

const showMessage = (message: string, color: string = 'success') => {
  snackbar.value = {
    show: true,
    message,
    color,
  }
}

// Get program code from class section
const getProgramCode = (classSection: ClassSection) => {
  if (typeof classSection.program_id === 'object' && classSection.program_id !== null)
    return classSection.program_id.programCode

  const program = programs.value.find(p => p.id === classSection.program_id)

  return program?.programCode
}

// Fetch class sections from Directus
const fetchClassSections = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/ClassSection', {
      params: {
        fields: ['id', 'section', 'program_id.id', 'program_id.programCode'],
      },
    })

    classSections.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch class sections:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch programs for dropdown
const fetchPrograms = async () => {
  try {
    const res = await $api('/items/programs', {
      params: {
        fields: ['id', 'programCode', 'programName'],
        sort: 'programCode',
      },
    })

    programs.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch programs:', error)
  }
}

// Open dialog for creating new class section
const openCreateDialog = () => {
  isEditing.value = false
  form.value = { section: [], program_id: null }
  bulkSectionsInput.value = ''
  isDialogOpen.value = true
}

// Open dialog for editing class section
const openEditDialog = (classSection: ClassSection) => {
  isEditing.value = true

  // Extract program_id as number
  const programId = typeof classSection.program_id === 'object' && classSection.program_id !== null
    ? classSection.program_id.id
    : classSection.program_id

  form.value = {
    id: classSection.id,
    section: [...classSection.section],
    program_id: programId,
  }

  bulkSectionsInput.value = ''
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = async (classSection: ClassSection) => {
  selectedClassSection.value = classSection
  isDeleteDialogOpen.value = true
  await checkClassSectionDeletion(classSection)
}

// Check if class section can be deleted
const checkClassSectionDeletion = async (classSection: ClassSection) => {
  if (!classSection.id) return

  isCheckingDeletion.value = true
  deletionBlockedReason.value = null
  relatedClasses.value = []

  try {
    // Get the sections from this class section configuration
    const sections = classSection.section || []

    if (sections.length === 0) {
      isCheckingDeletion.value = false
      return
    }

    // Check for classes using any of these section names
    const classesRes = await $api('/items/classes', {
      params: {
        filter: {
          section: { _in: sections },
        },
        fields: ['id', 'section', 'course_id.courseCode', 'acadTerm_id.schoolYear', 'acadTerm_id.semester'],
        limit: 10,
      },
    })

    if (classesRes.data && classesRes.data.length > 0) {
      relatedClasses.value = classesRes.data
      deletionBlockedReason.value = 'classes'
    }
  }
  catch (error) {
    console.error('Failed to check class section deletion:', error)
  }
  finally {
    isCheckingDeletion.value = false
  }
}

// Save class section (create or update)
const saveClassSection = async () => {
  try {
    if (isEditing.value && form.value.id) {
      // Update existing class section
      await $api(`/items/ClassSection/${form.value.id}`, {
        method: 'PATCH',
        body: {
          section: form.value.section,
          program_id: form.value.program_id,
        },
      })
      showMessage('Class section updated successfully')
    }
    else {
      // Create new class section
      await $api('/items/ClassSection', {
        method: 'POST',
        body: {
          section: form.value.section,
          program_id: form.value.program_id,
        },
      })
      showMessage('Class section created successfully')
    }

    isDialogOpen.value = false
    await fetchClassSections()
  }
  catch (error) {
    console.error('Failed to save class section:', error)
    showMessage('Failed to save class section.', 'error')
  }
}

// Delete class section
const deleteClassSection = async () => {
  if (!selectedClassSection.value?.id)
    return

  // Don't allow deletion if class section has dependencies
  if (deletionBlockedReason.value) {
    return
  }

  try {
    await $api(`/items/ClassSection/${selectedClassSection.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedClassSection.value = null
    deletionBlockedReason.value = null
    relatedClasses.value = []
    await fetchClassSections()
  }
  catch (error) {
    console.error('Failed to delete class section:', error)
  }
}

// Fetch data on mount
onMounted(() => {
  fetchClassSections()
  fetchPrograms()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Class Sections Management</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search class sections..."
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
          Add Class Section
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="classSections"
        :search="search"
        :loading="isLoading"
        hover
      >
        <template #item.program="{ item }">
          <VChip
            color="primary"
            variant="tonal"
            size="small"
          >
            {{ getProgramCode(item) }}
          </VChip>
        </template>

        <template #item.section="{ item }">
          <div class="d-flex flex-wrap gap-1">
            <VChip
              v-for="sec in item.section"
              :key="sec"
              size="small"
              variant="outlined"
            >
              {{ sec }}
            </VChip>
          </div>
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
            <p class="text-body-1 text-medium-emphasis">No class sections found</p>
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
          {{ isEditing ? 'Edit Class Section' : 'Add New Class Section' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="form.program_id"
                label="Program"
                :items="programs"
                item-title="programCode"
                item-value="id"
                variant="outlined"
                :rules="[v => !!v || 'Program is required']"
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.programCode }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.programName }}
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="bulkSectionsInput"
                label="Sections"
                placeholder="e.g., 1A 1B 2A 2B 3A 3B"
                variant="outlined"
                hint="Enter sections separated by spaces (e.g., 1A 2A 2B 3C) and press Enter"
                persistent-hint
                @keyup.enter="addBulkSections"
              >
                <template #append-inner>
                  <VBtn
                    color="primary"
                    variant="tonal"
                    size="small"
                    @click="addBulkSections"
                  >
                    Add
                  </VBtn>
                </template>
              </VTextField>

              <!-- Display added sections as chips -->
              <div v-if="form.section.length > 0" class="d-flex flex-wrap gap-2 mt-4">
                <VChip
                  v-for="sec in form.section"
                  :key="sec"
                  closable
                  color="primary"
                  variant="tonal"
                  @click:close="removeSection(sec)"
                >
                  {{ sec }}
                </VChip>
              </div>
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
            :disabled="!form.program_id || form.section.length === 0"
            @click="saveClassSection"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Confirmation Dialog -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="500"
    >
      <VCard>
        <VCardTitle class="pa-6 d-flex align-center gap-2">
          <VIcon icon="ri-error-warning-line" color="error" />
          Delete Class Section
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Loading state -->
          <div v-if="isCheckingDeletion" class="d-flex justify-center pa-4">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <template v-else>
            <!-- Blocked: Has classes using these sections -->
            <template v-if="deletionBlockedReason === 'classes'">
              <VAlert
                type="error"
                variant="tonal"
                class="mb-4"
              >
                <template #title>
                  Cannot Delete Class Section
                </template>
                There are {{ relatedClasses.length }}+ class(es) using sections from this configuration. Please delete or reassign those classes first.
              </VAlert>

              <p class="text-subtitle-2 mb-2">Classes using these sections (showing first 10):</p>
              <VList density="compact" class="mb-4">
                <VListItem
                  v-for="cls in relatedClasses"
                  :key="cls.id"
                  density="compact"
                >
                  <template #prepend>
                    <VIcon icon="ri-book-line" size="small" />
                  </template>
                  <VListItemTitle>
                    {{ cls.course_id?.courseCode || 'Unknown Course' }} - Section {{ cls.section }}
                  </VListItemTitle>
                  <VListItemSubtitle>
                    {{ cls.acadTerm_id?.schoolYear }} {{ cls.acadTerm_id?.semester }}
                  </VListItemSubtitle>
                </VListItem>
              </VList>
            </template>

            <!-- Can delete -->
            <template v-else>
              <p class="mb-4">
                Are you sure you want to delete the class sections for <strong>{{ selectedClassSection ? getProgramCode(selectedClassSection) : '' }}</strong>?
              </p>

              <p v-if="selectedClassSection?.section?.length" class="text-subtitle-2 mb-2">
                Sections to be deleted: <strong>{{ selectedClassSection.section.join(', ') }}</strong>
              </p>

              <p class="text-error font-weight-medium mb-0">
                This action cannot be undone.
              </p>
            </template>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            {{ deletionBlockedReason ? 'Close' : 'Cancel' }}
          </VBtn>
          <VBtn
            v-if="!deletionBlockedReason && !isCheckingDeletion"
            color="error"
            @click="deleteClassSection"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3000"
      location="top end"
    >
      {{ snackbar.message }}

      <template #actions>
        <VBtn
          icon="ri-close-line"
          variant="text"
          density="comfortable"
          @click="snackbar.show = false"
        />
      </template>
    </VSnackbar>    
  </div>
</template>
