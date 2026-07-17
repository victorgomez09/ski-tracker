import { API_BASE_URL } from "constants/constants";
import { useRouter } from "expo-router";
import { SubmitHandler, useForm } from "react-hook-form";

interface Register {
    email: string;
    password: string;
    display_name: string;
    first_name: string;
    last_name: string;
}

export default function RegisterView() {
    const router = useRouter();
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<Register>({ mode: "onTouched" })

    const onSubmit: SubmitHandler<Register> = async (data) => {
        const request = await fetch(`${API_BASE_URL}/auth/register`, {
            body: JSON.stringify(data),
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        })

        if (request.ok) {
            router.push("/login")
        }
    }

    return (
        <div className="hero bg-base-200 min-h-screen">
            <div className="hero-content flex-col lg:flex-row-reverse">
                <div className="card bg-base-100 w-80 shrink-0 shadow-md">
                    <div className="card-body">
                        <h1 className="card-title">Register</h1>

                        <form onSubmit={handleSubmit(onSubmit)}>
                            <fieldset className="fieldset">
                                {/* FIRST NAME */}
                                <label className="label">First Name</label>
                                <input type="text" className={`input input-bordered ${errors.first_name ? "input-error" : ""}`} placeholder="First Name" {...register("first_name", {
                                    required: true,
                                })} />
                                {errors.first_name?.type === "required" && <p className="label italic text-error">First Name is required</p>}

                                {/* LAST NAME */}
                                <label className="label">Last Name</label>
                                <input type="text" className={`input input-bordered ${errors.last_name ? "input-error" : ""}`} placeholder="Last Name" {...register("last_name", {
                                    required: true,
                                })} />
                                {errors.last_name?.type === "required" && <p className="label italic text-error">Last Name is required</p>}

                                {/* DISPLAY NAME */}
                                <label className="label">Display Name</label>
                                <input type="text" className={`input input-bordered ${errors.display_name ? "input-error" : ""}`} placeholder="Display Name" {...register("display_name", {
                                    required: true,
                                })} />
                                {errors.display_name?.type === "required" && <p className="label italic text-error">Display Name is required</p>}

                                {/* EMAIL */}
                                <label className="label">Email</label>
                                <input type="email" className={`input input-bordered ${errors.email ? "input-error" : ""}`} placeholder="Email" {...register("email", {
                                    required: true,
                                    pattern: /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/
                                })} />
                                {errors.email?.type === "required" && <p className="label italic text-error">Email is required</p>}
                                {errors.email?.type === "pattern" && <p className="label italic text-error">Invalid email address</p>}

                                {/* PASSWORD */}
                                <label className="label">Password</label>
                                <input type="password" className={`input input-bordered ${errors.password ? "input-error" : ""}`} placeholder="Password" {...register("password", {
                                    required: true,
                                })} />
                                {errors.password?.type === "required" && <p className="label italic text-error">Password is required</p>}

                                {/* SUBMIT */}
                                <button className="btn btn-neutral mt-4" type="submit" disabled={Object.keys(errors).length > 0}>Register</button>

                                <a href="/login" className="link link-secondary text-center">If you already have an account, login here!</a>
                            </fieldset>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}