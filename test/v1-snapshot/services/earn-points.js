/**
 * Earn Points Module
 *
 * Tracks one-time social tasks (follow, subscribe, join) that award loyalty points.
 * Each task can only be completed once per customer.
 */

export class EarnPointsModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * List completed earn-point tasks for the authenticated customer.
   * @returns {Promise<{completed_tasks: string[]}>}
   */
  async list() {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/earn-points/tasks`;
    return this.client._fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Mark a social task as completed and award points.
   * Each task can only be completed once.
   * @param {string} taskId - The task identifier (e.g. "follow_instagram", "join_discord")
   * @returns {Promise<{success: boolean, task_id: string, points_awarded: number, points_remaining: number}>}
   */
  async complete(taskId) {
    const token = this.client.auth._accessToken;
    if (!token) throw new Error("Not authenticated");
    const url = `${this.client.baseURL}/api/storefront/earn-points/complete`;
    return this.client._fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task_id: taskId }),
    });
  }
}

export default EarnPointsModule;
