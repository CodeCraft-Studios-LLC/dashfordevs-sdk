// Records revalidation calls so tests can assert on them.
export const revalidated: Array<[string, string, string?]> = [];
export function revalidatePath(path: string, type?: string) {
  revalidated.push(["path", path, type]);
}
export function revalidateTag(tag: string) {
  revalidated.push(["tag", tag]);
}
