<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'programs',
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
const openDeleteDialog = (program: Program) => {
  selectedProgram.value = program
  isDeleteDialogOpen.value = true
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
    }

    isDialogOpen.value = false
    await fetchPrograms()
  }
  catch (error) {
    console.error('Failed to save program:', error)
  }
}

// Delete program
const deleteProgram = async () => {
  if (!selectedProgram.value?.id)
    return

  try {
    await $api(`/items/programs/${selectedProgram.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedProgram.value = null
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
        <span class="text-h5">Programs</span>
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
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Delete Program
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ selectedProgram?.programName }}</strong>?
          This action cannot be undone.
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
            @click="deleteProgram"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
