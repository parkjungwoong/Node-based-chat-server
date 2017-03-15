module.exports = {
    mysql : {
        development : {
            host                : 'localhost',
            port                : 3306,
            user                : 'root',
            password            : 'yourPassword',
            database            : 'test_db',
            connectionLimit     :20,
            waitForConnections  :false
        },
        production : {
            host                : 'localhost',
            port                : 3306,
            user                : 'root',
            password            : 'yourPassword',
            database            : 'test_db',
            connectionLimit     :20,
            waitForConnections  :true
        }
    }
}