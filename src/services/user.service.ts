// User service - handles Directus user management operations
import { $api } from '@/utils/api'
import type { Role, AccountCredential } from '@/types'
import type { ServiceResponse, ListResponse } from './base.service'

class UserServiceClass {
  /**
   * Fetch all roles
   */
  async getRoles(): Promise<ListResponse<Role>> {
    try {
      const res = await $api('/roles', {
        params: { fields: ['id', 'name'] },
      })
      return { data: res.data || [], success: true }
    }
    catch (error) {
      console.error('Failed to fetch roles:', error)
      return { data: [], success: false, error: String(error) }
    }
  }

  /**
   * Get role ID by name
   */
  async getRoleIdByName(roleName: string): Promise<string | null> {
    const { data: roles } = await this.getRoles()
    const role = roles.find(r => r.name.toLowerCase() === roleName.toLowerCase())
    return role?.id ?? null
  }

  /**
   * Create a Directus user account
   */
  async createUser(userData: {
    email: string
    password: string
    first_name: string
    last_name: string
    role: string
  }): Promise<ServiceResponse<{ id: string } | null>> {
    try {
      const res = await $api('/users', {
        method: 'POST',
        body: userData,
      })
      return { data: res.data, success: true }
    }
    catch (error) {
      console.error('Failed to create user:', error)
      return { data: null, success: false, error: String(error) }
    }
  }

  /**
   * Update user status (active/suspended)
   */
  async updateStatus(userId: string, isActive: boolean): Promise<ServiceResponse<void>> {
    try {
      const status = isActive ? 'active' : 'suspended'
      await $api(`/users/${userId}`, {
        method: 'PATCH',
        body: { status },
      })
      return { data: undefined, success: true }
    }
    catch (error) {
      console.error('Failed to update user status:', error)
      return { data: undefined, success: false, error: String(error) }
    }
  }

  /**
   * Reset user password
   */
  async resetPassword(userId: string, newPassword: string): Promise<ServiceResponse<void>> {
    try {
      await $api(`/users/${userId}`, {
        method: 'PATCH',
        body: { password: newPassword },
      })
      return { data: undefined, success: true }
    }
    catch (error) {
      console.error('Failed to reset password:', error)
      return { data: undefined, success: false, error: String(error) }
    }
  }

  /**
   * Delete a user
   */
  async deleteUser(userId: string): Promise<ServiceResponse<void>> {
    try {
      await $api(`/users/${userId}`, {
        method: 'DELETE',
      })
      return { data: undefined, success: true }
    }
    catch (error) {
      console.error('Failed to delete user:', error)
      return { data: undefined, success: false, error: String(error) }
    }
  }

  /**
   * Generate a random password
   */
  generatePassword(length = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
    let password = ''
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
  }

  /**
   * Create a student account (combines user creation and student linking)
   */
  async createStudentAccount(
    studentId: number,
    email: string,
    firstName: string,
    lastName: string,
    linkCallback: (studentId: number, userId: string) => Promise<any>,
  ): Promise<ServiceResponse<AccountCredential | null>> {
    const studentRoleId = await this.getRoleIdByName('student')
    if (!studentRoleId) {
      return { data: null, success: false, error: 'Student role not found' }
    }

    const password = this.generatePassword()
    const { data: user, success, error } = await this.createUser({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role: studentRoleId,
    })

    if (!success || !user) {
      return { data: null, success: false, error }
    }

    // Link user to student record
    await linkCallback(studentId, user.id)

    return {
      data: {
        name: `${lastName}, ${firstName}`,
        email,
        password,
      },
      success: true,
    }
  }

  /**
   * Create a dean account (combines user creation and teacher linking)
   */
  async createDeanAccount(
    teacherId: number,
    email: string,
    firstName: string,
    lastName: string,
    linkCallback: (teacherId: number, userId: string) => Promise<any>,
  ): Promise<ServiceResponse<AccountCredential | null>> {
    const deanRoleId = await this.getRoleIdByName('dean')
    if (!deanRoleId) {
      return { data: null, success: false, error: 'Dean role not found' }
    }

    const password = this.generatePassword()
    const { data: user, success, error } = await this.createUser({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role: deanRoleId,
    })

    if (!success || !user) {
      return { data: null, success: false, error }
    }

    // Link user to teacher record
    await linkCallback(teacherId, user.id)

    return {
      data: {
        name: `${lastName}, ${firstName}`,
        email,
        password,
      },
      success: true,
    }
  }
}

// Export singleton instance
export const UserService = new UserServiceClass()
