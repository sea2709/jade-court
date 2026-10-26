/**
 * Records Facebook data-deletion callbacks for public status lookup by confirmation code.
 */
export type DataDeletionRecord = {
  confirmationCode: string;
  facebookUserId: string;
  deletedAt: Date;
};

export interface DataDeletionStore {
  record(entry: DataDeletionRecord): Promise<void>;
  findByConfirmationCode(code: string): Promise<DataDeletionRecord | null>;
}
