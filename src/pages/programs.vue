<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'programs',
    allowedRoles: ['administrator'],
  },
})

interface Program {
  id?: number
  programCode: string
  programName: string
}

// State
const programs = ref<Program[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedProgram = ref<Program | null>(null)

// Deletion prevention state
const isCheckingDeletion = ref(false)
const deletionBlockedReason = ref<string | null>(null)
const relatedDepartments = ref<any[]>([])
const relatedClassSections = ref<any[]>([])

const form = ref<Program>({
  programCode: '',
  programName: '',
})

const search = ref('')

// Table headers
const headers = [
  { title: 'Program Code', key: 'programCode', sortable: true },
  { title: 'Program Name', key: 'programName', sortable: true },
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
// Fetch programs from Directus
const fetchPrograms = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/programs')

    programs.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch programs:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Open dialog for creating new program
const openCreateDialog = () => {
  isEditing.value = false
  form.value = { programCode: '', programName: '' }
  isDialogOpen.value = true
}

// Open dialog for editing program
const openEditDialog = (program: Program) => {
  isEditing.value = true
  form.value = { ...program }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = async (program: Program) => {
  selectedProgram.value = program
  isDeleteDialogOpen.value = true
  await checkProgramDeletion(program)
}

// Check if program can be deleted
const checkProgramDeletion = async (program: Program) => {
  if (!program.id) return

  isCheckingDeletion.value = true
  deletionBlockedReason.value = null
  relatedDepartments.value = []
  relatedClassSections.value = []

  try {
    // Check for departments using this program
    const deptRes = await $api('/items/Department', {
      params: {
        filter: { name: { _eq: program.id } },
        fields: ['id', 'name.programName', 'name.programCode'],
      },
    })

    if (deptRes.data && deptRes.data.length > 0) {
      relatedDepartments.value = deptRes.data
      deletionBlockedReason.value = 'departments'
      isCheckingDeletion.value = false
      return
    }

    // Check for class sections using this program
    const classSectionRes = await $api('/items/ClassSection', {
      params: {
        filter: { program_id: { _eq: program.id } },
        fields: ['id', 'section'],
      },
    })

    if (classSectionRes.data && classSectionRes.data.length > 0) {
      relatedClassSections.value = classSectionRes.data
      deletionBlockedReason.value = 'classSections'
    }
  }
  catch (error) {
    console.error('Failed to check program deletion:', error)
  }
  finally {
    isCheckingDeletion.value = false
  }
}

// Save program (create or update)
const saveProgram = async () => {
  try {
    if (isEditing.value && form.value.id) {
      // Update existing program
      await $api(`/items/programs/${form.value.id}`, {
        method: 'PATCH',
        body: {
          programCode: form.value.programCode,
          programName: form.value.programName,
        },
      })
      showMessage('Program updated successfully')
    }
    else {
      // Create new program
      await $api('/items/programs', {
        method: 'POST',
        body: {
          programCode: form.value.programCode,
          programName: form.value.programName,
        },
      })
      showMessage('Program created successfully')
    }

    isDialogOpen.value = false
    await fetchPrograms()
  }
  catch (error) {
    console.error('Failed to save program:', error)
    showMessage('Failed to save program.', 'error')
  }
}

// Delete program
const deleteProgram = async () => {
  if (!selectedProgram.value?.id)
    return

  // Don't allow deletion if program has dependencies
  if (deletionBlockedReason.value) {
    return
  }

  try {
    await $api(`/items/programs/${selectedProgram.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedProgram.value = null
    deletionBlockedReason.value = null
    relatedDepartments.value = []
    relatedClassSections.value = []
    await fetchPrograms()
  }
  catch (error) {
    console.error('Failed to delete program:', error)
  }
}

// Fetch programs on mount
onMounted(() => {
  fetchPrograms()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Program Management</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search programs..."
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
          Add Program
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="programs"
        :search="search"
        :loading="isLoading"
        hover
      >
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
            <p class="text-body-1 text-medium-emphasis">No programs found</p>
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
          {{ isEditing ? 'Edit Program' : 'Add New Program' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="form.programCode"
                label="Program Code"
                placeholder="e.g., BSCS"
                variant="outlined"
                :rules="[v => !!v || 'Program code is required']"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="form.programName"
                label="Program Name"
                placeholder="e.g., Bachelor of Science in Computer Science"
                variant="outlined"
                :rules="[v => !!v || 'Program name is required']"
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
            :disabled="!form.programCode || !form.programName"
            @click="saveProgram"
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
          Delete Program
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Loading state -->
          <div v-if="isCheckingDeletion" class="d-flex justify-center pa-4">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <template v-else>
            <!-- Blocked: Has departments -->
            <template v-if="deletionBlockedReason === 'departments'">
              <VAlert
                type="error"
                variant="tonal"
                class="mb-4"
              >
                <template #title>
                  Cannot Delete Program
                </template>
                This program has {{ relatedDepartments.length }} department(s) associated with it. Please delete the departments first.
              </VAlert>

              <p class="text-subtitle-2 mb-2">Related Departments:</p>
              <VList density="compact" class="mb-4">
                <VListItem
                  v-for="dept in relatedDepartments"
                  :key="dept.id"
                  density="compact"
                >
                  <template #prepend>
                    <VIcon icon="ri-building-line" size="small" />
                  </template>
                  <VListItemTitle>
                    {{ dept.name?.programName || dept.name?.programCode || 'Department' }}
                  </VListItemTitle>
                </VListItem>
              </VList>
            </template>

            <!-- Blocked: Has class sections -->
            <template v-else-if="deletionBlockedReason === 'classSections'">
              <VAlert
                type="error"
                variant="tonal"
                class="mb-4"
              >
                <template #title>
                  Cannot Delete Program
                </template>
                This program has {{ relatedClassSections.length }} class section configuration(s). Please delete them first.
              </VAlert>

              <p class="text-subtitle-2 mb-2">Related Class Sections:</p>
              <VList density="compact" class="mb-4">
                <VListItem
                  v-for="cs in relatedClassSections"
                  :key="cs.id"
                  density="compact"
                >
                  <template #prepend>
                    <VIcon icon="ri-group-line" size="small" />
                  </template>
                  <VListItemTitle>
                    Sections: {{ cs.section?.join(', ') || 'N/A' }}
                  </VListItemTitle>
                </VListItem>
              </VList>
            </template>

            <!-- Can delete -->
            <template v-else>
              <p class="mb-4">
                Are you sure you want to delete <strong>{{ selectedProgram?.programName }}</strong>?
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
            @click="deleteProgram"
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
