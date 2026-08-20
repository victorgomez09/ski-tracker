To insert a new changelog into database:
1. create a .json inside changelogs folder with the same structure
2. run this script
```shell
go run ./apps/api/cmd/changelog/main.go -dir="./changelogs" -db="postgres://user:password@localhost:5432/database?sslmode=disable"
```