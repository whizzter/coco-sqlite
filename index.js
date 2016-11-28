
let sqlite=require("sqlite3");

module.exports=(name,...opts)=>{
	let db=new sqlite.Database(name,opts);

	return {
		query(qs,...args) {
			let rejfn;
			let resfn;
			
			db.all(qs,...args,(err,rows)=>{
				if (err) {
					rejfn(new Error(err));
				} else {
					resfn({rowCount:rows.length,rows});
				}
			});

			return new Promise(function(res,rej) {
				rejfn=rej;
				resfn=res;
			});
		}
	}
};