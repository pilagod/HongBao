export function run(action: (...args: any) => Promise<any>) {
    action()
        .then(() => process.exit(0))
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
}
